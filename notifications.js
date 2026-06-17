//notifications.js
/**
 * StudyHub Notification System
 * Drop this script into every page (after Firebase SDKs + config).
 * It injects a bell icon into the nav and manages unread-PDF counters
 * via localStorage so state persists across sessions on the same browser.
 *
 * HOW IT WORKS
 * ─────────────
 * • When a PDF is added to Firestore it gets an `uploadedAt` timestamp.
 * • We store `studyhub_last_seen` (ISO string) in localStorage —
 *   the moment the user last opened the notification panel.
 * • Any PDF whose `uploadedAt` is after `last_seen` counts as "new".
 * • Opening the panel resets the counter (updates `last_seen`).
 *
 * USAGE
 * ─────
 * 1. Copy this file next to your HTML files.
 * 2. Add  <script src="notifications.js"></script>
 *    AFTER the Firebase SDKs and AFTER window.FIREBASE_CONFIG is defined
 *    but BEFORE </body>.
 * 3. The script finds the <nav> element automatically and appends the bell.
 */

(function () {
  "use strict";

  /* ─── constants ─── */
  const LS_KEY   = "studyhub_last_seen";   // localStorage key
  const MAX_SHOW = 20;                      // max items in dropdown list

  /* ─── state ─── */
  let unread     = [];   // array of new PDF objects
  let allRecent  = [];   // last MAX_SHOW PDFs (for the list)
  let panelOpen  = false;

  /* ─── wait for DOM + Firebase ─── */
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    injectStyles();
    buildBell();
    subscribeToFirestore();
  }

  /* ══════════════════════════════════════════════════════════
     1.  INJECT STYLES
     ══════════════════════════════════════════════════════════ */
  function injectStyles() {
    const css = `
      /* ── Bell wrapper ── */
      #sh-notif-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      /* ── Bell button ── */
      #sh-bell-btn {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: transparent;
        color: #A09DC0;
        font-size: 17px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color .2s, border-color .2s, background .2s;
        position: relative;
        font-family: inherit;
        flex-shrink: 0;
      }
      #sh-bell-btn:hover {
        color: #F0EFF8;
        border-color: rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.04);
      }
      #sh-bell-btn.active {
        color: #A78BFA;
        border-color: rgba(108,99,255,0.4);
        background: rgba(108,99,255,0.1);
      }

      /* ── Badge counter ── */
      #sh-badge {
        position: absolute;
        top: -5px;
        right: -5px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 99px;
        background: linear-gradient(135deg, #F87171, #EF4444);
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        font-family: 'Plus Jakarta Sans', sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #0A0A12;
        line-height: 1;
        transform: scale(0);
        transition: transform .25s cubic-bezier(.34,1.56,.64,1);
        pointer-events: none;
        z-index: 2;
      }
      #sh-badge.visible {
        transform: scale(1);
      }
      /* shake when new item arrives */
      @keyframes sh-shake {
        0%,100%{ transform: scale(1) rotate(0deg) }
        20%    { transform: scale(1.15) rotate(-12deg) }
        40%    { transform: scale(1.15) rotate(12deg) }
        60%    { transform: scale(1.1) rotate(-8deg) }
        80%    { transform: scale(1.1) rotate(8deg) }
      }
      #sh-bell-btn.shake {
        animation: sh-shake .55s ease;
      }

      /* ── Dropdown panel ── */
      #sh-panel {
        display: none;
        position: absolute;
        top: calc(100% + 10px);
        right: 0;
        width: 340px;
        max-height: 480px;
        background: #1A1A2E;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 20px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.6);
        z-index: 9999;
        overflow: hidden;
        flex-direction: column;
        animation: sh-drop .22s ease;
      }
      #sh-panel.open {
        display: flex;
      }
      @keyframes sh-drop {
        from { opacity:0; transform: translateY(-8px) scale(.97) }
        to   { opacity:1; transform: translateY(0)   scale(1)    }
      }

      /* panel header */
      .sh-panel-head {
        padding: 16px 18px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.07);
        flex-shrink: 0;
      }
      .sh-panel-head h4 {
        font-family: 'Syne', sans-serif;
        font-size: 15px;
        font-weight: 800;
        color: #F0EFF8;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sh-head-badge {
        padding: 2px 8px;
        border-radius: 99px;
        background: rgba(108,99,255,0.2);
        color: #A78BFA;
        font-size: 11px;
        font-weight: 700;
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      .sh-mark-all {
        font-size: 11px;
        color: #6B6880;
        background: none;
        border: none;
        cursor: pointer;
        font-family: inherit;
        transition: color .2s;
        padding: 4px 8px;
        border-radius: 6px;
      }
      .sh-mark-all:hover {
        color: #A09DC0;
        background: rgba(255,255,255,0.04);
      }

      /* scrollable list */
      .sh-list {
        overflow-y: auto;
        flex: 1;
        padding: 8px;
        scrollbar-width: thin;
        scrollbar-color: #6C63FF #0F0F1C;
      }
      .sh-list::-webkit-scrollbar { width: 4px; }
      .sh-list::-webkit-scrollbar-track { background: #0F0F1C; }
      .sh-list::-webkit-scrollbar-thumb { background: #6C63FF; border-radius: 99px; }

      /* individual notification row */
      .sh-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 11px 12px;
        border-radius: 12px;
        cursor: pointer;
        transition: background .15s;
        position: relative;
      }
      .sh-item:hover {
        background: rgba(255,255,255,0.04);
      }
      .sh-item.sh-new {
        background: rgba(108,99,255,0.08);
      }
      .sh-item.sh-new:hover {
        background: rgba(108,99,255,0.14);
      }
      .sh-emoji {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: rgba(108,99,255,0.12);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
      }
      .sh-item-body {
        flex: 1;
        min-width: 0;
      }
      .sh-item-title {
        font-size: 13px;
        font-weight: 600;
        color: #F0EFF8;
        line-height: 1.35;
        margin-bottom: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sh-item-meta {
        font-size: 11px;
        color: #6B6880;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .sh-tag {
        padding: 1px 7px;
        border-radius: 99px;
        background: rgba(108,99,255,0.12);
        color: #A78BFA;
        font-size: 10px;
        font-weight: 600;
      }
      /* unread dot */
      .sh-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #6C63FF;
        flex-shrink: 0;
        margin-top: 5px;
      }
      .sh-item:not(.sh-new) .sh-dot {
        opacity: 0;
      }

      /* empty state */
      .sh-empty {
        padding: 36px 20px;
        text-align: center;
        color: #6B6880;
        font-size: 13px;
        line-height: 1.6;
      }
      .sh-empty-icon {
        font-size: 32px;
        margin-bottom: 10px;
        display: block;
        color: #6B6880;
      }

      /* panel footer */
      .sh-panel-foot {
        padding: 10px 14px;
        border-top: 1px solid rgba(255,255,255,0.07);
        flex-shrink: 0;
      }
      .sh-foot-link {
        display: block;
        text-align: center;
        font-size: 12px;
        color: #A09DC0;
        text-decoration: none;
        padding: 8px;
        border-radius: 8px;
        transition: background .2s, color .2s;
      }
      .sh-foot-link:hover {
        background: rgba(255,255,255,0.04);
        color: #F0EFF8;
      }

      /* loading state */
      .sh-loading {
        padding: 30px 20px;
        text-align: center;
        color: #6B6880;
        font-size: 13px;
      }
      @keyframes sh-spin {
        from { transform: rotate(0deg) }
        to   { transform: rotate(360deg) }
      }
      .sh-spin-icon {
        display: inline-block;
        animation: sh-spin .9s linear infinite;
        font-size: 22px;
        margin-bottom: 8px;
        color: #A78BFA;
      }

      /* mobile tweaks */
      @media (max-width: 480px) {
        #sh-panel {
          width: calc(100vw - 32px);
          right: -12px;
        }
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════
     2.  BUILD THE BELL BUTTON + PANEL
     ══════════════════════════════════════════════════════════ */
  function buildBell() {
    const nav = document.querySelector("nav");
    if (!nav) return;

    // wrapper keeps bell + panel in a positioned container
    const wrap = document.createElement("div");
    wrap.id = "sh-notif-wrap";

    // ── bell button ──
    const btn = document.createElement("button");
    btn.id = "sh-bell-btn";
    btn.title = "Notifications";
    btn.innerHTML = `<img src="1781704084645_bell.png" style="width:20px;height:20px;object-fit:contain;filter:brightness(0) invert(1);opacity:.75" alt="bell" onerror="this.outerHTML='<i class=\\'ti ti-bell\\'></i>'"/>`;
    btn.addEventListener("click", togglePanel);

    // ── badge ──
    const badge = document.createElement("span");
    badge.id = "sh-badge";
    badge.textContent = "0";
    btn.appendChild(badge);

    // ── dropdown panel ──
    const panel = document.createElement("div");
    panel.id = "sh-panel";
    panel.innerHTML = `
      <div class="sh-panel-head">
        <h4>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#A78BFA"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Notifications
          <span class="sh-head-badge" id="sh-unread-count">0 new</span>
        </h4>
        <button class="sh-mark-all" onclick="window._shMarkAll()">Mark all read</button>
      </div>
      <div class="sh-list" id="sh-list">
        <div class="sh-loading">
          <div class="sh-spin-icon">◌</div><br/>Loading…
        </div>
      </div>
      <div class="sh-panel-foot">
        <a href="index.html#materials" class="sh-foot-link">View all materials →</a>
      </div>`;

    wrap.appendChild(btn);
    wrap.appendChild(panel);

    // Insert bell BEFORE the last child of nav-right (or directly into nav)
    // const navRight = nav.querySelector(".nav-right");
    // if (navRight) {
    //   navRight.insertBefore(wrap, navRight.firstChild);
    // } else {
    //   nav.appendChild(wrap);
    // }

    const navRight = nav.querySelector(".nav-right");
    if (navRight) {
        navRight.appendChild(wrap);
    } else {
    nav.appendChild(wrap);
    }

    // close panel when clicking outside
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) closePanel();
    });

    // expose mark-all globally so inline onclick can reach it
    window._shMarkAll = markAllRead;
  }

  /* ══════════════════════════════════════════════════════════
     3.  FIRESTORE LISTENER
     ══════════════════════════════════════════════════════════ */
  function subscribeToFirestore() {
    // Wait until firebase is available
    if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) {
      setTimeout(subscribeToFirestore, 300);
      return;
    }

    const db = firebase.firestore();

    db.collection("pdfs")
      .orderBy("uploadedAt", "desc")
      .limit(MAX_SHOW)
      .onSnapshot(
        function (snap) {
          allRecent = snap.docs.map(function (d) {
            return Object.assign({ id: d.id }, d.data());
          });
          computeUnread();
          renderList();
          updateBadge();
        },
        function (err) {
          console.warn("[StudyHub Notif] Firestore error:", err.message);
        }
      );
  }

  /* ══════════════════════════════════════════════════════════
     4.  UNREAD LOGIC
     ══════════════════════════════════════════════════════════ */
  function getLastSeen() {
    const v = localStorage.getItem(LS_KEY);
    return v ? new Date(v) : new Date(0); // epoch = first ever visit
  }

  function computeUnread() {
    const lastSeen = getLastSeen();
    unread = allRecent.filter(function (pdf) {
      if (!pdf.uploadedAt) return false;
      const ts = pdf.uploadedAt.toDate ? pdf.uploadedAt.toDate() : new Date(pdf.uploadedAt);
      return ts > lastSeen;
    });
  }

  function markAllRead() {
    localStorage.setItem(LS_KEY, new Date().toISOString());
    unread = [];
    updateBadge();
    renderList();
    // remove 'active' tint from bell
    const btn = document.getElementById("sh-bell-btn");
    if (btn) btn.classList.remove("active");
  }

  /* ══════════════════════════════════════════════════════════
     5.  BADGE
     ══════════════════════════════════════════════════════════ */
  let prevUnreadCount = 0;

  function updateBadge() {
    const badge  = document.getElementById("sh-badge");
    const btn    = document.getElementById("sh-bell-btn");
    const countEl= document.getElementById("sh-unread-count");
    if (!badge || !btn) return;

    const count = unread.length;

    // update count label
    if (countEl) {
      countEl.textContent = count > 0 ? count + " new" : "All read";
      countEl.style.background = count > 0
        ? "rgba(108,99,255,0.2)" : "rgba(52,211,153,0.1)";
      countEl.style.color = count > 0 ? "#A78BFA" : "#34D399";
    }

    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.classList.add("visible");
      btn.classList.add("active");

      // shake if new items arrived since last render
      if (count > prevUnreadCount && prevUnreadCount >= 0 && document.visibilityState !== "hidden") {
        btn.classList.remove("shake");
        // force reflow to restart animation
        void btn.offsetWidth;
        btn.classList.add("shake");
        btn.addEventListener("animationend", function () {
          btn.classList.remove("shake");
        }, { once: true });
      }
    } else {
      badge.classList.remove("visible");
      btn.classList.remove("active");
    }
    prevUnreadCount = count;
  }

  /* ══════════════════════════════════════════════════════════
     6.  RENDER LIST
     ══════════════════════════════════════════════════════════ */
  const subjectEmoji = {
    Mathematics: "🧮", Physics: "⚛️", Chemistry: "⚗️", Biology: "🧬",
    "CS & Tech": "💻", Economics: "📈", Literature: "📚", History: "📜",
    Psychology: "🧠", Engineering: "⚙️", Default: "📄"
  };

  function timeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)   return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400)return Math.floor(diff / 3600) + "h ago";
    if (diff < 604800)return Math.floor(diff / 86400) + "d ago";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isNew(pdf) {
    return unread.some(function (u) { return u.id === pdf.id; });
  }

  function renderList() {
    const list = document.getElementById("sh-list");
    if (!list) return;

    if (!allRecent.length) {
      list.innerHTML = `
        <div class="sh-empty">
          <span class="sh-empty-icon">📭</span>
          No study materials yet.<br/>Check back soon!
        </div>`;
      return;
    }

    list.innerHTML = allRecent.map(function (pdf) {
      const emoji = subjectEmoji[pdf.subject] || subjectEmoji["Default"];
      const _new  = isNew(pdf);
      let ago = "";
      if (pdf.uploadedAt) {
        const d = pdf.uploadedAt.toDate ? pdf.uploadedAt.toDate() : new Date(pdf.uploadedAt);
        ago = timeAgo(d);
      }
      return `
        <div class="sh-item ${_new ? "sh-new" : ""}"
             onclick="window._shOpenPdf('${esc(pdf.id)}')">
          <div class="sh-emoji">${emoji}</div>
          <div class="sh-item-body">
            <div class="sh-item-title">${esc(pdf.title || "Untitled")}</div>
            <div class="sh-item-meta">
              <span class="sh-tag">${esc(pdf.subject || "General")}</span>
              ${pdf.level ? `<span>${esc(pdf.level)}</span>` : ""}
              ${ago ? `<span>· ${ago}</span>` : ""}
            </div>
          </div>
          <div class="sh-dot"></div>
        </div>`;
    }).join("");
  }

  /* ── open a PDF ── */
  window._shOpenPdf = function (id) {
    closePanel();
    markAllRead();
    window.location.href = "viewer.html?id=" + encodeURIComponent(id);
  };

  /* ══════════════════════════════════════════════════════════
     7.  PANEL OPEN / CLOSE
     ══════════════════════════════════════════════════════════ */
  function togglePanel(e) {
    e.stopPropagation();
    panelOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    panelOpen = true;
    const panel = document.getElementById("sh-panel");
    if (panel) panel.classList.add("open");
  }

  function closePanel() {
    panelOpen = false;
    const panel = document.getElementById("sh-panel");
    if (panel) panel.classList.remove("open");
  }

})();