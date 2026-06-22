/**
 * StudyHub Search Module
 * ======================
 * Drop-in live search + filter for the PDF library.
 *
 * USAGE — include after Firebase SDKs on any page:
 *   <script src="search.js"></script>
 *
 * Then call once Firebase + allPdfs are ready:
 *   SHSearch.init({
 *     getPdfs:       () => allPdfs,          // function returning current PDF array
 *     onResults:     (filtered) => render(), // called whenever results change
 *     currentUser:   user,                   // Firebase auth user (may be null)
 *     searchInputId: 'pdfSearchInput',       // optional, default below
 *     counterId:     'searchResultCount',    // optional
 *   });
 *
 * Or mount the full search bar into a container:
 *   SHSearch.mountBar(document.getElementById('searchBarSlot'));
 *
 * Firestore collection used (for search history):
 *   searchHistory/{uid}/queries/{auto-id}
 *     query: string, searchedAt: timestamp
 */

window.SHSearch = (function () {
  'use strict';

  /* ── config ── */
  const DEBOUNCE_MS   = 220;
  const MAX_HISTORY   = 8;
  const INPUT_ID      = 'shSearchInput';
  const DROPDOWN_ID   = 'shSearchDropdown';

  let _getPdfs       = () => [];
  let _onResults     = () => {};
  let _currentUser   = null;
  let _db            = null;
  let _debounceTimer = null;
  let _lastQuery     = '';
  let _recentQueries = [];   // loaded from localStorage + Firestore
  let _isOpen        = false;

  /* ── init ── */
  function init({ getPdfs, onResults, currentUser, searchInputId, counterId } = {}) {
    if (getPdfs)    _getPdfs   = getPdfs;
    if (onResults)  _onResults = onResults;
    if (currentUser) _currentUser = currentUser;

    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
      _db = firebase.firestore();
    }

    _loadRecentFromStorage();

    // wire up an existing input if provided
    const inputId = searchInputId || INPUT_ID;
    const el = document.getElementById(inputId);
    if (el) _wireInput(el);
  }

  /* ── mount a full search bar into a container element ── */
  function mountBar(container, options = {}) {
    if (!container) return;
    container.innerHTML = _barHtml(options);
    _injectStyles();

    const input    = container.querySelector('.sh-search-input');
    const clearBtn = container.querySelector('.sh-search-clear');
    const dropdown = container.querySelector('.sh-search-dropdown');

    _wireInput(input, clearBtn, dropdown);
  }

  function _barHtml({ placeholder = 'Search PDFs, subjects, topics…', showFilters = true } = {}) {
    return `
      <div class="sh-search-wrap">
        <div class="sh-search-field">
          <svg class="sh-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            id="${INPUT_ID}"
            class="sh-search-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="${placeholder}"
            aria-label="Search study materials"
            aria-expanded="false"
            aria-haspopup="listbox"
          />
          <button class="sh-search-clear" aria-label="Clear search" style="display:none">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <kbd class="sh-search-kbd">⌘K</kbd>
        </div>
        <div class="sh-search-dropdown" id="${DROPDOWN_ID}" role="listbox" aria-label="Search suggestions"></div>
      </div>`;
  }

  /* ── wire an input element to the search logic ── */
  function _wireInput(input, clearBtn, dropdown) {
    if (!input) return;

    // find siblings if not passed
    if (!clearBtn)  clearBtn  = input.parentElement?.querySelector('.sh-search-clear');
    if (!dropdown)  dropdown  = document.getElementById(DROPDOWN_ID) || input.closest('.sh-search-wrap')?.querySelector('.sh-search-dropdown');

    // keyboard shortcut ⌘K / Ctrl+K
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        input.focus();
        input.select();
        if (dropdown) _openDropdown(input, dropdown, clearBtn);
      }
      if (e.key === 'Escape') {
        input.blur();
        if (dropdown) _closeDropdown(input, dropdown);
      }
    });

    input.addEventListener('focus', () => {
      if (dropdown) _openDropdown(input, dropdown, clearBtn);
    });

    input.addEventListener('input', () => {
      const q = input.value;
      if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => _search(q, input, dropdown, clearBtn), DEBOUNCE_MS);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        _search('', input, dropdown, clearBtn);
        input.focus();
      });
    }

    // close on outside click
    document.addEventListener('click', e => {
      if (!input.closest('.sh-search-wrap')?.contains(e.target)) {
        if (dropdown) _closeDropdown(input, dropdown);
      }
    });
  }

  /* ── core search ── */
  function _search(rawQuery, input, dropdown, clearBtn) {
    const q = rawQuery.trim().toLowerCase();
    _lastQuery = q;

    const pdfs = _getPdfs();

    let results;
    if (!q) {
      results = pdfs;
      if (dropdown) _renderDropdownRecent(dropdown, input);
    } else {
      results = _filterPdfs(pdfs, q);
      if (dropdown) _renderDropdownResults(dropdown, results, q, input);
    }

    _onResults(results, q);

    // update counter if present
    const counter = document.getElementById('shResultCount');
    if (counter) {
      counter.textContent = q ? `${results.length} result${results.length !== 1 ? 's' : ''} for "${rawQuery.trim()}"` : '';
      counter.style.display = q ? 'block' : 'none';
    }
  }

  function _filterPdfs(pdfs, q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    return pdfs.filter(pdf => {
      const haystack = [
        pdf.title       || '',
        pdf.subject     || '',
        pdf.description || '',
        pdf.level       || '',
        pdf.author      || '',
        pdf.tags?.join(' ') || '',
      ].join(' ').toLowerCase();

      // every token must appear somewhere
      return tokens.every(t => haystack.includes(t));
    }).sort((a, b) => {
      // exact title match first
      const aTitle = (a.title || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();
      const aExact = aTitle.startsWith(q) ? 0 : 1;
      const bExact = bTitle.startsWith(q) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      // then subject match
      const aSub = (a.subject || '').toLowerCase().includes(q) ? 0 : 1;
      const bSub = (b.subject || '').toLowerCase().includes(q) ? 0 : 1;
      return aSub - bSub;
    });
  }

  /* ── dropdown: recent searches ── */
  function _renderDropdownRecent(dropdown, input) {
    if (!_isOpen) return;
    const items = _recentQueries.slice(0, 5);
    const popular = _popularSubjects();

    dropdown.innerHTML = `
      ${items.length ? `
        <div class="sh-dd-section">
          <div class="sh-dd-section-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Recent
          </div>
          ${items.map(q => `
            <div class="sh-dd-item sh-dd-item--recent" tabindex="0"
              onclick="SHSearch._pickSuggestion('${_esc(q)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span>${_esc(q)}</span>
              <button class="sh-dd-remove" title="Remove" onclick="event.stopPropagation();SHSearch._removeRecent('${_esc(q)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>`).join('')}
        </div>` : ''}

      ${popular.length ? `
        <div class="sh-dd-section">
          <div class="sh-dd-section-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            Popular subjects
          </div>
          <div class="sh-dd-chips">
            ${popular.map(s => `
              <button class="sh-dd-chip" onclick="SHSearch._pickSuggestion('${_esc(s)}')">${_esc(s)}</button>
            `).join('')}
          </div>
        </div>` : ''}

      ${!items.length && !popular.length ? `<div class="sh-dd-empty">Start typing to search all materials</div>` : ''}
    `;
  }

  /* ── dropdown: live results ── */
  function _renderDropdownResults(dropdown, results, q, input) {
    if (!_isOpen) return;
    const shown = results.slice(0, 6);

    if (!shown.length) {
      dropdown.innerHTML = `
        <div class="sh-dd-noresults">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          <p>No results for <strong>"${_esc(q)}"</strong></p>
          <span>Try a subject name, topic, or keyword</span>
        </div>`;
      return;
    }

    const subjectIcon = {
      'Mathematics':'📐','Physics':'⚛️','Chemistry':'⚗️','Biology':'🧬',
      'CS & Tech':'💻','Economics':'📈','Literature':'📚','History':'📜',
      'Psychology':'🧠','Engineering':'⚙️',
    };

    dropdown.innerHTML = `
      <div class="sh-dd-section">
        <div class="sh-dd-section-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          ${results.length} result${results.length !== 1 ? 's' : ''}
        </div>
        ${shown.map(pdf => `
          <div class="sh-dd-item sh-dd-item--result" tabindex="0"
            onclick="SHSearch._pickResult('${_esc(pdf.id || '')}','${_esc(q)}')">
            <span class="sh-dd-result-icon">${subjectIcon[pdf.subject] || '📄'}</span>
            <div class="sh-dd-result-body">
              <div class="sh-dd-result-title">${_highlight(_esc(pdf.title || 'Untitled'), q)}</div>
              <div class="sh-dd-result-meta">
                <span>${_esc(pdf.subject || 'General')}</span>
                ${pdf.level ? `<span>·</span><span>${_esc(pdf.level)}</span>` : ''}
                ${pdf.pages ? `<span>·</span><span>${pdf.pages}pp</span>` : ''}
              </div>
            </div>
            <svg class="sh-dd-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>`).join('')}
        ${results.length > 6 ? `
          <div class="sh-dd-more" onclick="SHSearch._pickSuggestion('${_esc(q)}')">
            See all ${results.length} results for "${_esc(q)}" →
          </div>` : ''}
      </div>`;
  }

  /* ── highlight matched text ── */
  function _highlight(text, q) {
    if (!q) return text;
    const tokens = q.split(/\s+/).filter(Boolean);
    let out = text;
    tokens.forEach(t => {
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      out = out.replace(re, '<mark class="sh-hl">$1</mark>');
    });
    return out;
  }

  /* ── pick a suggestion / result ── */
  function _pickSuggestion(q) {
    const input = document.getElementById(INPUT_ID);
    if (input) {
      input.value = q;
      const clearBtn = input.parentElement?.querySelector('.sh-search-clear');
      if (clearBtn) clearBtn.style.display = 'flex';
    }
    _saveRecent(q);
    _search(q, input, document.getElementById(DROPDOWN_ID));
    _closeDropdown(input, document.getElementById(DROPDOWN_ID));
  }

  function _pickResult(pdfId, q) {
    _saveRecent(q);
    _closeDropdown(document.getElementById(INPUT_ID), document.getElementById(DROPDOWN_ID));
    if (pdfId) window.location.href = `viewer.html?id=${encodeURIComponent(pdfId)}`;
  }

  /* ── open / close dropdown ── */
  function _openDropdown(input, dropdown, clearBtn) {
    _isOpen = true;
    dropdown.classList.add('sh-dd--open');
    input.setAttribute('aria-expanded', 'true');
    if (!input.value) {
      _renderDropdownRecent(dropdown, input);
    } else {
      const results = _filterPdfs(_getPdfs(), input.value.trim().toLowerCase());
      _renderDropdownResults(dropdown, results, input.value.trim(), input);
    }
  }

  function _closeDropdown(input, dropdown) {
    _isOpen = false;
    if (dropdown) dropdown.classList.remove('sh-dd--open');
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  /* ── recent queries ── */
  function _loadRecentFromStorage() {
    try {
      const raw = localStorage.getItem('sh_search_recent');
      _recentQueries = raw ? JSON.parse(raw) : [];
    } catch (e) {
      _recentQueries = [];
    }
  }

  function _saveRecent(q) {
    if (!q || q.trim().length < 2) return;
    const clean = q.trim();
    _recentQueries = [clean, ..._recentQueries.filter(r => r !== clean)].slice(0, MAX_HISTORY);
    try { localStorage.setItem('sh_search_recent', JSON.stringify(_recentQueries)); } catch (e) {}

    // also write to Firestore for cross-device sync
    if (_db && _currentUser) {
      _db.collection('searchHistory').doc(_currentUser.uid)
        .collection('queries').add({
          query: clean,
          searchedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
    }
  }

  function _removeRecent(q) {
    _recentQueries = _recentQueries.filter(r => r !== q);
    try { localStorage.setItem('sh_search_recent', JSON.stringify(_recentQueries)); } catch (e) {}
    // re-render
    const dropdown = document.getElementById(DROPDOWN_ID);
    const input    = document.getElementById(INPUT_ID);
    if (dropdown && input) _renderDropdownRecent(dropdown, input);
  }

  /* ── popular subjects (derived from PDF data) ── */
  function _popularSubjects() {
    const pdfs = _getPdfs();
    const counts = {};
    pdfs.forEach(p => { if (p.subject) counts[p.subject] = (counts[p.subject] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s]) => s);
  }

  /* ── public search trigger (call from outside) ── */
  function search(query) {
    _pickSuggestion(query);
  }

  /* ── escape html ── */
  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── inject styles ── */
  function _injectStyles() {
    if (document.getElementById('sh-search-styles')) return;
    const style = document.createElement('style');
    style.id = 'sh-search-styles';
    style.textContent = `
      /* ── Wrap ── */
      .sh-search-wrap {
        position: relative;
        width: 100%;
      }

      /* ── Field ── */
      .sh-search-field {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 14px;
        height: 46px;
        background: var(--bg3, #181A21);
        border: 1px solid var(--border2, rgba(255,255,255,0.11));
        border-radius: 12px;
        transition: border-color .2s, box-shadow .2s;
        position: relative;
      }
      .sh-search-field:focus-within {
        border-color: var(--accent, #5B7FFF);
        box-shadow: 0 0 0 3px rgba(91,127,255,0.13);
      }

      .sh-search-icon {
        color: var(--text3, #62656F);
        flex-shrink: 0;
        transition: color .2s;
      }
      .sh-search-field:focus-within .sh-search-icon {
        color: var(--accent2, #8FA3D6);
      }

      .sh-search-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        font-size: 14px;
        font-family: 'Inter', sans-serif;
        color: var(--text, #ECEDF1);
        min-width: 0;
      }
      .sh-search-input::placeholder {
        color: var(--text3, #62656F);
      }

      .sh-search-clear {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        border: none;
        background: rgba(255,255,255,0.06);
        color: var(--text3, #62656F);
        cursor: pointer;
        flex-shrink: 0;
        transition: all .15s;
        padding: 0;
      }
      .sh-search-clear:hover {
        background: rgba(255,255,255,0.12);
        color: var(--text, #ECEDF1);
      }

      .sh-search-kbd {
        font-size: 10.5px;
        font-family: 'Inter', sans-serif;
        color: var(--text3, #62656F);
        background: var(--bg2, #13141A);
        border: 1px solid var(--border2, rgba(255,255,255,0.11));
        border-radius: 5px;
        padding: 2px 6px;
        flex-shrink: 0;
        pointer-events: none;
        transition: opacity .2s;
      }
      .sh-search-field:focus-within .sh-search-kbd { opacity: 0; }

      /* ── Dropdown ── */
      .sh-search-dropdown {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        right: 0;
        background: var(--card2, #1B1D25);
        border: 1px solid var(--border2, rgba(255,255,255,0.11));
        border-radius: 14px;
        z-index: 500;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        overflow: hidden;
        display: none;
        animation: sh-dd-in .18s cubic-bezier(.22,1,.36,1);
      }
      .sh-search-dropdown.sh-dd--open { display: block; }
      @keyframes sh-dd-in {
        from { opacity: 0; transform: translateY(-6px) scale(.98); }
        to   { opacity: 1; transform: none; }
      }

      /* ── Section ── */
      .sh-dd-section { padding: 8px; }
      .sh-dd-section + .sh-dd-section {
        border-top: 1px solid var(--border, rgba(255,255,255,0.06));
      }
      .sh-dd-section-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text3, #62656F);
        padding: 6px 8px 8px;
      }

      /* ── Items ── */
      .sh-dd-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 10px;
        border-radius: 9px;
        cursor: pointer;
        transition: background .15s;
        color: var(--text2, #9498A6);
        font-size: 13.5px;
      }
      .sh-dd-item:hover, .sh-dd-item:focus {
        background: rgba(255,255,255,0.04);
        color: var(--text, #ECEDF1);
        outline: none;
      }
      .sh-dd-item svg { flex-shrink: 0; color: var(--text3, #62656F); }

      .sh-dd-remove {
        margin-left: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 5px;
        border: none;
        background: transparent;
        color: var(--text3, #62656F);
        cursor: pointer;
        opacity: 0;
        transition: all .15s;
        padding: 0;
        flex-shrink: 0;
      }
      .sh-dd-item:hover .sh-dd-remove { opacity: 1; }
      .sh-dd-remove:hover { background: rgba(194,86,79,0.15); color: var(--red, #C2564F); }

      /* ── Result items ── */
      .sh-dd-result-icon { font-size: 18px; flex-shrink: 0; width: 20px; text-align: center; }
      .sh-dd-result-body { flex: 1; min-width: 0; }
      .sh-dd-result-title {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--text, #ECEDF1);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sh-dd-result-meta {
        font-size: 11.5px;
        color: var(--text3, #62656F);
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 2px;
        flex-wrap: wrap;
      }
      .sh-dd-arrow { color: var(--text3, #62656F); flex-shrink: 0; opacity: 0; transition: opacity .15s; }
      .sh-dd-item:hover .sh-dd-arrow { opacity: 1; }

      /* ── Highlight ── */
      .sh-hl {
        background: rgba(91,127,255,0.22);
        color: var(--accent2, #8FA3D6);
        border-radius: 3px;
        padding: 0 1px;
        font-style: normal;
      }

      /* ── Subject chips ── */
      .sh-dd-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 2px 8px 8px;
      }
      .sh-dd-chip {
        padding: 5px 12px;
        border-radius: 6px;
        background: var(--bg3, #181A21);
        border: 1px solid var(--border2, rgba(255,255,255,0.11));
        color: var(--text2, #9498A6);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        font-family: 'Inter', sans-serif;
        transition: all .15s;
      }
      .sh-dd-chip:hover {
        background: rgba(91,127,255,0.1);
        border-color: rgba(91,127,255,0.3);
        color: var(--accent2, #8FA3D6);
      }

      /* ── More / empty ── */
      .sh-dd-more {
        padding: 10px 18px;
        font-size: 12.5px;
        color: var(--accent2, #8FA3D6);
        cursor: pointer;
        border-top: 1px solid var(--border, rgba(255,255,255,0.06));
        transition: background .15s;
        margin: 0 -8px -8px;
      }
      .sh-dd-more:hover { background: rgba(255,255,255,0.03); }

      .sh-dd-noresults {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 32px 20px;
        color: var(--text3, #62656F);
        text-align: center;
        gap: 6px;
      }
      .sh-dd-noresults p { font-size: 13.5px; color: var(--text2, #9498A6); }
      .sh-dd-noresults p strong { color: var(--text, #ECEDF1); }
      .sh-dd-noresults span { font-size: 12px; }

      .sh-dd-empty {
        padding: 20px;
        font-size: 13px;
        color: var(--text3, #62656F);
        text-align: center;
      }

      /* ── Result count banner ── */
      #shResultCount {
        display: none;
        font-size: 12.5px;
        color: var(--text3, #62656F);
        margin-top: 10px;
        padding: 0 2px;
      }

      /* ── Active search state on section header ── */
      .sh-search-active-query {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 6px;
        background: rgba(91,127,255,0.1);
        border: 1px solid rgba(91,127,255,0.2);
        font-size: 12px;
        color: var(--accent2, #8FA3D6);
        font-weight: 500;
      }
    `;
    document.head.appendChild(style);
  }

  /* ── auto-inject styles on load ── */
  _injectStyles();

  /* ── PUBLIC API ── */
  return {
    init,
    mountBar,
    search,
    _pickSuggestion,
    _pickResult,
    _removeRecent,
  };
})();