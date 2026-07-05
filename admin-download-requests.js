/* ═══════════════════════════════════════════════════════════════
   admin-download-requests.js
   Drop this <script> into admin.html after Firebase SDKs.
   It adds a "Download Requests" section to the admin panel with:
     • Real-time list of pending/completed/rejected requests
     • One-click approve / reject
     • Bell notification badge on the admin nav
   ═══════════════════════════════════════════════════════════════ */

(function () {

  /* ── Inject styles ── */
  const css = `
    #admDlNotifDot {
      position:absolute;top:-4px;right:-4px;
      width:16px;height:16px;border-radius:50%;
      background:#F85149;border:2px solid var(--bg,#0E0F12);
      font-size:9px;font-weight:700;color:#fff;
      display:none;align-items:center;justify-content:center;
      font-family:Inter,sans-serif;line-height:1;
    }
    #admDlNotifDot.show{display:flex}

    .dlreq-item {
      padding:16px;border-radius:10px;background:var(--bg2,#13141A);
      border:1px solid var(--border,rgba(255,255,255,0.06));
      display:flex;align-items:flex-start;gap:14px;transition:border-color .2s;
    }
    .dlreq-item:hover{border-color:var(--border2,rgba(255,255,255,0.11))}
    .dlreq-emoji{width:38px;height:38px;border-radius:9px;
      background:var(--card,#15161C);border:1px solid var(--border,rgba(255,255,255,0.06));
      display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
    .dlreq-info{flex:1;min-width:0}
    .dlreq-name{font-size:13.5px;font-weight:600;color:var(--text,#ECEDF1);
      margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dlreq-meta{font-size:11.5px;color:var(--text3,#62656F);
      display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .dlreq-badge{padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700}
    .dlreq-badge.pending  {background:rgba(210,153,34,0.12);color:#D29922}
    .dlreq-badge.approved {background:rgba(63,185,80,0.12);color:#3FB950}
    .dlreq-badge.rejected {background:rgba(248,81,73,0.1);color:#F85149}
    .dlreq-badge.completed{background:rgba(88,166,255,0.1);color:#58A6FF}
    .dlreq-badge.cancelled{background:rgba(255,255,255,0.06);color:var(--text3,#62656F)}
    .dlreq-actions{display:flex;gap:6px;flex-shrink:0;align-items:center}
    .dlreq-btn{display:flex;align-items:center;gap:5px;padding:7px 13px;border-radius:7px;
      font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid;
      transition:all .15s}
    .dlreq-btn.approve{background:rgba(35,134,54,0.12);border-color:rgba(46,160,67,0.3);
      color:#3FB950}
    .dlreq-btn.approve:hover{background:rgba(35,134,54,0.25)}
    .dlreq-btn.reject{background:rgba(248,81,73,0.08);border-color:rgba(248,81,73,0.2);
      color:#F85149}
    .dlreq-btn.reject:hover{background:rgba(248,81,73,0.18)}
    .dlreq-status-label{font-size:12px;font-weight:600;padding:5px 10px;
      border-radius:6px;border:1px solid var(--border,rgba(255,255,255,0.06));
      color:var(--text2,#9498A6)}
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── Build the admin section panel ── */
  function buildPanel() {
    // Look for the section nav
    const secNav = document.querySelector('.admin-section-nav');
    if (!secNav) { console.warn('[DLA Admin] .admin-section-nav not found'); return; }

    // Add pill to nav
    const pill = document.createElement('button');
    pill.className = 'adm-pill';
    pill.dataset.sec = 'dlrequests';
    pill.style.position = 'relative';
    pill.innerHTML = `📥 Download Reqs <span id="admDlNotifDot">0</span>`;
    pill.onclick = () => window.admSwitch && admSwitch('dlrequests');
    secNav.appendChild(pill);

    // Build panel
    const panel = document.createElement('div');
    panel.id = 'adm-dlrequests';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="panel" style="margin-top:24px">
        <div class="panel-title">
          <i class="ti ti-download"></i> Download Requests
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
          <button class="filter-tab active" data-dlfilter="pending"   onclick="filterDlReqs('pending')">Pending</button>
          <button class="filter-tab"        data-dlfilter="approved"  onclick="filterDlReqs('approved')">Approved</button>
          <button class="filter-tab"        data-dlfilter="rejected"  onclick="filterDlReqs('rejected')">Rejected</button>
          <button class="filter-tab"        data-dlfilter="all"       onclick="filterDlReqs('all')">All</button>
        </div>
        <div id="dlReqList" style="display:flex;flex-direction:column;gap:10px;max-height:600px;overflow-y:auto">
          <div class="empty-list"><i class="ti ti-loader"></i><p>Loading…</p></div>
        </div>
      </div>`;

    // Insert after the last adm-* div
    const pageWrap = document.querySelector('.page-wrap');
    if (pageWrap) pageWrap.appendChild(panel);
    else document.querySelector('#adminUI').appendChild(panel);
  }

  /* ── Register in admSwitch ── */
  function patchAdmSwitch() {
    const original = window.admSwitch;
    window.admSwitch = function(sec) {
      const panel = document.getElementById('adm-dlrequests');
      if (panel) panel.style.display = sec === 'dlrequests' ? 'block' : 'none';
      document.querySelectorAll('.adm-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.sec === sec);
      });
      if (original && sec !== 'dlrequests') original(sec);
    };
  }

  /* ── Real-time listener ── */
  let allRequests = [];
  let currentFilter = 'pending';

  function loadDownloadRequests(db) {
    db.collection('downloadRequests')
      .orderBy('requestedAt', 'desc')
      .onSnapshot(snap => {
        allRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateBadge();
        renderRequests();
      }, err => {
        console.warn('[DLA Admin] snapshot error:', err.message);
      });
  }

  function updateBadge() {
    const pending = allRequests.filter(r => r.status === 'pending').length;
    const dot = document.getElementById('admDlNotifDot');
    if (!dot) return;
    dot.textContent = pending > 9 ? '9+' : String(pending);
    dot.classList.toggle('show', pending > 0);

    // Also shake the bell if notifications.js is loaded
    const bell = document.getElementById('sh-bell-btn');
    if (bell && pending > 0) {
      bell.classList.remove('shake');
      void bell.offsetWidth;
      bell.classList.add('shake');
    }
  }

  window.filterDlReqs = function(filter) {
    currentFilter = filter;
    document.querySelectorAll('[data-dlfilter]').forEach(b =>
      b.classList.toggle('active', b.dataset.dlfilter === filter));
    renderRequests();
  };

  function fileEmoji(name) {
    const e = (name||'').split('.').pop().toLowerCase();
    const map = {js:'🟨',jsx:'⚛️',ts:'🔷',html:'🧡',css:'🎨',py:'🐍',java:'☕',
      c:'🔵',cpp:'🔵',md:'📝',json:'📦',pdf:'📕',zip:'🗜️',png:'🖼️',jpg:'🖼️'};
    return map[e] || '📄';
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
  }

  function renderRequests() {
    const el = document.getElementById('dlReqList');
    if (!el) return;

    let list = currentFilter === 'all'
      ? allRequests
      : allRequests.filter(r => r.status === currentFilter);

    if (!list.length) {
      el.innerHTML = `<div class="empty-list"><i class="ti ti-inbox"></i><p>No ${currentFilter === 'all' ? '' : currentFilter} requests.</p></div>`;
      return;
    }

    el.innerHTML = list.map(req => {
      const isPending = req.status === 'pending';
      const actions = isPending ? `
        <button class="dlreq-btn approve" onclick="adminApproveDl('${req.id}','${escHtml(req.fileUrl||'')}','${escHtml(req.userId||'')}')">
          <i class="ti ti-check"></i> Approve
        </button>
        <button class="dlreq-btn reject" onclick="adminRejectDl('${req.id}')">
          <i class="ti ti-x"></i> Reject
        </button>` : `<span class="dlreq-status-label">${req.status}</span>`;

      return `
        <div class="dlreq-item">
          <div class="dlreq-emoji">${fileEmoji(req.fileName)}</div>
          <div class="dlreq-info">
            <div class="dlreq-name">${escHtml(req.fileName || 'Unknown file')}</div>
            <div class="dlreq-meta">
              <span class="dlreq-badge ${req.status}">${req.status}</span>
              <span>${escHtml(req.userName || 'Unknown')}</span>
              <span>·</span>
              <span>${escHtml(req.userEmail || '')}</span>
              <span>·</span>
              <span>${timeAgo(req.requestedAt)}</span>
              ${req.otpVerified ? '<span style="color:#3FB950">✓ OTP verified</span>' : ''}
            </div>
          </div>
          <div class="dlreq-actions">${actions}</div>
        </div>`;
    }).join('');
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Approve ── */
  window.adminApproveDl = async function(requestId, fileUrl, userId) {
    const db = firebase.firestore();
    try {
      await db.collection('downloadRequests').doc(requestId).update({
        status: 'approved',
        approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        approvedBy: firebase.auth().currentUser?.email,
      });
      // Update admin notification
      await db.collection('adminNotifications').doc(requestId).update({ status:'approved', read:true }).catch(()=>{});
      // Clear from user's localStorage (best-effort via Firestore flag)
      await db.collection('downloadRequests').doc(requestId).update({ notifiedUser: true }).catch(()=>{});
      showAdminToast('Download approved ✅', 'success');
    } catch(e) {
      showAdminToast('Error: ' + e.message, 'error');
    }
  };

  /* ── Reject ── */
  window.adminRejectDl = async function(requestId) {
    if (!confirm('Reject this download request?')) return;
    const db = firebase.firestore();
    try {
      await db.collection('downloadRequests').doc(requestId).update({
        status: 'rejected',
        rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
        rejectedBy: firebase.auth().currentUser?.email,
      });
      await db.collection('adminNotifications').doc(requestId).update({ status:'rejected', read:true }).catch(()=>{});
      showAdminToast('Request rejected.', 'success');
    } catch(e) {
      showAdminToast('Error: ' + e.message, 'error');
    }
  };

  function showAdminToast(msg, type) {
    if (typeof showToast === 'function') { showToast(msg, type); return; }
    const t = document.getElementById('toast');
    if (!t) return;
    const m = document.getElementById('toastMsg');
    if (m) m.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  /* ── Init ── */
  function init() {
    // Wait for Firebase + admin auth
    const check = setInterval(() => {
      if (typeof firebase !== 'undefined' && firebase.apps.length) {
        clearInterval(check);
        firebase.auth().onAuthStateChanged(user => {
          if (!user) return;
          buildPanel();
          patchAdmSwitch();
          loadDownloadRequests(firebase.firestore());
        });
      }
    }, 200);
  }

  init();
})();