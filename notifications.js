(function () {
  "use strict";

  /* ─── constants ─── */
  const LS_READ_IDS = "studyhub_read_ids";   // stores Set of read item IDs
  const MAX_SHOW    = 20;

  /* ─── state ─── */
  let allRecent         = [];
  let friendRequestNotifs = [];
  let profileViewNotifs = [];
  let panelOpen         = false;
  let prevUnreadCount   = 0;

  /* ─── helpers: read-state uses a persistent ID set ─── */
  function getReadIds() {
    try {
      return new Set(JSON.parse(localStorage.getItem(LS_READ_IDS) || "[]"));
    } catch (e) { return new Set(); }
  }

  function saveReadIds(set) {
    try {
      localStorage.setItem(LS_READ_IDS, JSON.stringify([...set]));
    } catch (e) {}
  }

  function markItemRead(id) {
    const ids = getReadIds();
    ids.add(id);
    saveReadIds(ids);
  }

  function markAllRead() {
    const ids = getReadIds();
    allRecent.forEach(p => ids.add(p.id));
    friendRequestNotifs.forEach(r => ids.add(r.id));
    profileViewNotifs.forEach(v => ids.add(v.id));
    saveReadIds(ids);
    updateBadge();
    renderList();
    const btn = document.getElementById("sh-bell-btn");
    if (btn) btn.classList.remove("sh-bell-active");
  }

  function isUnread(id) {
    return !getReadIds().has(id);
  }

  function getUnreadItems() {
    return [
      ...allRecent.filter(p => isUnread(p.id)),
      ...friendRequestNotifs.filter(r => isUnread(r.id)),
      ...profileViewNotifs.filter(v => isUnread(v.id)),
    ];
  }

  /* ─── init ─── */
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    injectStyles();
    buildBell();
    subscribeToFirestore();
  }

  /* ══════════════════════════════════════════════════════════
     1.  STYLES
     ══════════════════════════════════════════════════════════ */
  function injectStyles() {
    const css = `
      /* ── Wrapper ── */
      #sh-notif-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      /* ── Bell button ── */
      #sh-bell-btn {
        position: relative;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.03);
        color: #7C7A9A;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        font-family: inherit;
        flex-shrink: 0;
        outline: none;
      }
      #sh-bell-btn:hover {
        color: #E8E6F8;
        border-color: rgba(255,255,255,0.18);
        background: rgba(255,255,255,0.06);
      }
      #sh-bell-btn.sh-bell-active {
        color: #9B8EFF;
        border-color: rgba(108,99,255,0.35);
        background: rgba(108,99,255,0.08);
      }

      /* ── Badge ── */
      #sh-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        border-radius: 99px;
        background: #E8445A;
        color: #fff;
        font-size: 9.5px;
        font-weight: 700;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #0A0A12;
        line-height: 1;
        opacity: 0;
        transform: scale(0.6);
        transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.34,1.4,0.64,1);
        pointer-events: none;
        z-index: 2;
        letter-spacing: -0.3px;
      }
      #sh-badge.sh-badge-visible {
        opacity: 1;
        transform: scale(1);
      }

      /* Bell ring on new item */
      @keyframes sh-ring {
        0%   { transform: rotate(0deg); }
        10%  { transform: rotate(-14deg); }
        25%  { transform: rotate(14deg); }
        40%  { transform: rotate(-10deg); }
        55%  { transform: rotate(10deg); }
        70%  { transform: rotate(-5deg); }
        85%  { transform: rotate(5deg); }
        100% { transform: rotate(0deg); }
      }
      #sh-bell-btn.sh-ring i {
        display: inline-block;
        animation: sh-ring 0.6s ease;
        transform-origin: 50% 0%;
      }

      /* ── Dropdown panel ── */
      #sh-panel {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: 348px;
        max-height: 460px;
        background: #111118;
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 14px;
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.4),
          0 8px 24px rgba(0,0,0,0.4),
          0 32px 64px rgba(0,0,0,0.35);
        z-index: 9999;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        transform: translateY(-6px) scale(0.985);
        pointer-events: none;
        transition:
          opacity 0.18s ease,
          transform 0.18s ease;
      }
      #sh-panel.sh-open {
        display: flex;
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      /* Panel header */
      .sh-panel-head {
        padding: 14px 16px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        flex-shrink: 0;
      }
      .sh-panel-head-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sh-panel-title {
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 13.5px;
        font-weight: 700;
        color: #E8E6F8;
        letter-spacing: -0.1px;
      }
      .sh-count-pill {
        padding: 2px 7px;
        border-radius: 99px;
        font-size: 10.5px;
        font-weight: 700;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        letter-spacing: 0.1px;
        transition: background 0.2s, color 0.2s;
      }
      .sh-count-pill.has-new {
        background: rgba(155,142,255,0.15);
        color: #9B8EFF;
      }
      .sh-count-pill.all-read {
        background: rgba(52,211,153,0.10);
        color: #34D399;
      }
      .sh-mark-all-btn {
        font-size: 11px;
        font-weight: 500;
        color: #524F6E;
        background: none;
        border: none;
        cursor: pointer;
        font-family: inherit;
        padding: 4px 8px;
        border-radius: 6px;
        transition: color 0.15s, background 0.15s;
        letter-spacing: 0.1px;
      }
      .sh-mark-all-btn:hover {
        color: #9B8EFF;
        background: rgba(155,142,255,0.08);
      }

      /* Scrollable list */
      .sh-list {
        overflow-y: auto;
        flex: 1;
        padding: 6px;
        scrollbar-width: thin;
        scrollbar-color: rgba(108,99,255,0.4) transparent;
      }
      .sh-list::-webkit-scrollbar { width: 3px; }
      .sh-list::-webkit-scrollbar-track { background: transparent; }
      .sh-list::-webkit-scrollbar-thumb {
        background: rgba(108,99,255,0.4);
        border-radius: 99px;
      }

      /* Divider label */
      .sh-divider {
        padding: 8px 10px 4px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: #3E3C56;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      }

      /* Notification row */
      .sh-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 10px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.12s ease;
        position: relative;
      }
      .sh-item:hover {
        background: rgba(255,255,255,0.03);
      }
      .sh-item.sh-unread {
        background: rgba(108,99,255,0.06);
      }
      .sh-item.sh-unread:hover {
        background: rgba(108,99,255,0.10);
      }

      /* Icon box */
      .sh-icon-box {
        width: 34px;
        height: 34px;
        border-radius: 7px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
      }
      .sh-icon-box.type-pdf    { background: rgba(108,99,255,0.12); }
      .sh-icon-box.type-friend { background: rgba(52,211,153,0.10); }
      .sh-icon-box.type-view   { background: rgba(56,189,248,0.10); }

      /* Text block */
      .sh-item-body {
        flex: 1;
        min-width: 0;
      }
      .sh-item-title {
        font-size: 12.5px;
        font-weight: 600;
        color: #D8D6F0;
        line-height: 1.4;
        margin-bottom: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: -0.1px;
      }
      .sh-item.sh-unread .sh-item-title {
        color: #ECEAF8;
      }
      .sh-item-meta {
        font-size: 11px;
        color: #4A4866;
        display: flex;
        align-items: center;
        gap: 5px;
        flex-wrap: wrap;
      }
      .sh-tag {
        padding: 1px 6px;
        border-radius: 4px;
        background: rgba(255,255,255,0.05);
        color: #6B6880;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.1px;
      }

      /* Unread indicator dot */
      .sh-unread-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #6C63FF;
        flex-shrink: 0;
        margin-top: 6px;
        opacity: 0;
        transition: opacity 0.15s;
      }
      .sh-item.sh-unread .sh-unread-dot {
        opacity: 1;
      }

      /* Empty state */
      .sh-empty {
        padding: 40px 20px;
        text-align: center;
        color: #3E3C56;
        font-size: 13px;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        line-height: 1.6;
      }
      .sh-empty-icon {
        font-size: 28px;
        margin-bottom: 12px;
        display: block;
        opacity: 0.5;
      }
      .sh-empty p {
        color: #4A4866;
        font-size: 12.5px;
      }

      /* Panel footer */
      .sh-panel-foot {
        padding: 8px;
        border-top: 1px solid rgba(255,255,255,0.05);
        flex-shrink: 0;
      }
      .sh-foot-link {
        display: block;
        text-align: center;
        font-size: 12px;
        font-weight: 500;
        color: #524F6E;
        text-decoration: none;
        padding: 8px;
        border-radius: 7px;
        transition: background 0.15s, color 0.15s;
        letter-spacing: 0.1px;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      }
      .sh-foot-link:hover {
        background: rgba(255,255,255,0.04);
        color: #9B8EFF;
      }

      /* Loading */
      .sh-loading {
        padding: 32px 20px;
        text-align: center;
        color: #3E3C56;
        font-size: 12.5px;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      }

      /* Mobile */
      @media (max-width: 768px) {
        #sh-panel {
          position: fixed !important;
          top: 64px !important;
          left: 10px !important;
          right: 10px !important;
          width: calc(100vw - 20px) !important;
          max-height: 68vh !important;
          border-radius: 12px !important;
        }
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════
     2.  BUILD BELL
     ══════════════════════════════════════════════════════════ */
  function buildBell() {
    const nav = document.querySelector("nav");
    if (!nav) return;

    const wrap = document.createElement("div");
    wrap.id = "sh-notif-wrap";

    const btn = document.createElement("button");
    btn.id = "sh-bell-btn";
    btn.title = "Notifications";
    btn.setAttribute("aria-label", "Notifications");
    btn.innerHTML = `<i class="ti ti-bell"></i>`;
    btn.addEventListener("click", togglePanel);

    const badge = document.createElement("span");
    badge.id = "sh-badge";
    btn.appendChild(badge);

    const panel = document.createElement("div");
    panel.id = "sh-panel";
    panel.innerHTML = `
      <div class="sh-panel-head">
        <div class="sh-panel-head-left">
          <span class="sh-panel-title">Notifications</span>
          <span class="sh-count-pill has-new" id="sh-count-pill">0 new</span>
        </div>
        <button class="sh-mark-all-btn" onclick="window._shMarkAll()">Mark all read</button>
      </div>
      <div class="sh-list" id="sh-list">
        <div class="sh-loading">Loading…</div>
      </div>
      <div class="sh-panel-foot">
        <a href="index.html#materials" class="sh-foot-link">Browse all materials →</a>
      </div>`;

    wrap.appendChild(btn);
    wrap.appendChild(panel);

    const bellSlot = document.getElementById("bellSlot");
    if (bellSlot) {
      bellSlot.appendChild(wrap);
    } else {
      const navRight = nav.querySelector(".nav-right");
      navRight ? navRight.insertBefore(wrap, navRight.firstChild) : nav.appendChild(wrap);
    }

    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) closePanel();
    });

    window._shMarkAll = markAllRead;
  }

  /* ══════════════════════════════════════════════════════════
     3.  FIRESTORE SUBSCRIPTIONS
     ══════════════════════════════════════════════════════════ */
  function subscribeToFirestore() {
    if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) {
      setTimeout(subscribeToFirestore, 300);
      return;
    }

    const db = firebase.firestore();

    db.collection("pdfs")
      .orderBy("uploadedAt", "desc")
      .limit(MAX_SHOW)
      .onSnapshot(function (snap) {
        allRecent = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
        pruneReadIds();
        updateBadge();
        renderList();
      }, function (err) {
        console.warn("[StudyHub Notif] pdfs error:", err.message);
      });

    auth.onAuthStateChanged(function (user) {
      if (!user) return;
      syncUserProfile(user);

      db.collection("friendRequests")
        .where("to", "==", user.uid)
        .where("status", "==", "pending")
        .onSnapshot(function (snap) {
          friendRequestNotifs = snap.docs.map(d => Object.assign({ id: d.id, _type: "friendRequest" }, d.data()));
          pruneReadIds();
          updateBadge();
          renderList();
        }, function (err) {
          console.warn("[StudyHub Notif] friendRequests error:", err.message);
        });

      db.collection("profileViews")
        .where("profileOwnerUid", "==", user.uid)
        .orderBy("viewedAt", "desc")
        .limit(MAX_SHOW)
        .onSnapshot(function (snap) {
          profileViewNotifs = snap.docs.map(d => Object.assign({ id: d.id, _type: "profileView" }, d.data()));
          pruneReadIds();
          updateBadge();
          renderList();
        }, function (err) {
          console.warn("[StudyHub Notif] profileViews error:", err.message);
        });
    });
  }

  function syncUserProfile(user) {
    const db = firebase.firestore();
    db.collection("userProfiles").doc(user.uid).set({
      uid: user.uid,
      displayName: user.displayName || user.email.split("@")[0],
      email: user.email,
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => {
      console.warn("[StudyHub] userProfile sync error:", err.message);
    });
  }

  /* Remove stale IDs from localStorage so it doesn't grow forever */
  function pruneReadIds() {
    const allIds = new Set([
      ...allRecent.map(p => p.id),
      ...friendRequestNotifs.map(r => r.id),
      ...profileViewNotifs.map(v => v.id),
    ]);
    const current = getReadIds();
    const pruned  = new Set([...current].filter(id => allIds.has(id)));
    saveReadIds(pruned);
  }

  /* ══════════════════════════════════════════════════════════
     4.  BADGE UPDATE
     ══════════════════════════════════════════════════════════ */
  function updateBadge() {
    const badge   = document.getElementById("sh-badge");
    const btn     = document.getElementById("sh-bell-btn");
    const pill    = document.getElementById("sh-count-pill");
    if (!badge || !btn) return;

    const count = getUnreadItems().length;

    if (pill) {
      pill.textContent = count > 0 ? count + " new" : "All read";
      pill.className = "sh-count-pill " + (count > 0 ? "has-new" : "all-read");
    }

    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.classList.add("sh-badge-visible");
      btn.classList.add("sh-bell-active");

      /* ring bell if count increased */
      if (count > prevUnreadCount && document.visibilityState !== "hidden") {
        btn.classList.remove("sh-ring");
        void btn.offsetWidth;
        btn.classList.add("sh-ring");
        btn.addEventListener("animationend", () => btn.classList.remove("sh-ring"), { once: true });
      }
    } else {
      badge.classList.remove("sh-badge-visible");
      btn.classList.remove("sh-bell-active");
    }
    prevUnreadCount = count;
  }

  /* ══════════════════════════════════════════════════════════
     5.  RENDER LIST
     ══════════════════════════════════════════════════════════ */
  const subjectEmoji = {
    Mathematics:"🧮", Physics:"⚛️", Chemistry:"⚗️", Biology:"🧬",
    "CS & Tech":"💻", Economics:"📈", Literature:"📚", History:"📜",
    Psychology:"🧠", Engineering:"⚙️", Default:"📄"
  };

  function timeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)     return "just now";
    if (diff < 3600)   return Math.floor(diff / 60) + "m ago";
    if (diff < 86400)  return Math.floor(diff / 3600) + "h ago";
    if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderList() {
    const list = document.getElementById("sh-list");
    if (!list) return;

    const hasFriends  = friendRequestNotifs.length > 0;
    const hasViews    = profileViewNotifs.length > 0;
    const hasPdfs     = allRecent.length > 0;

    if (!hasFriends && !hasViews && !hasPdfs) {
      list.innerHTML = `
        <div class="sh-empty">
          <span class="sh-empty-icon">📭</span>
          <p>Nothing here yet.<br/>Check back when materials are uploaded.</p>
        </div>`;
      return;
    }

    let html = "";

    if (hasFriends) {
      html += `<div class="sh-divider">Friend Requests</div>`;
      html += friendRequestNotifs.map(req => `
        <div class="sh-item ${isUnread(req.id) ? "sh-unread" : ""}"
             onclick="window._shOpenFriends(); window._shReadItem('${esc(req.id)}')">
          <div class="sh-icon-box type-friend">🤝</div>
          <div class="sh-item-body">
            <div class="sh-item-title">${esc(req.fromName || "Someone")} sent you a friend request</div>
            <div class="sh-item-meta">
              <span class="sh-tag">Friend Request</span>
              <span>Tap to respond</span>
            </div>
          </div>
          <div class="sh-unread-dot"></div>
        </div>`).join("");
    }

    if (hasViews) {
      html += `<div class="sh-divider">Profile Views</div>`;
      html += profileViewNotifs.map(pv => {
        const ts = pv.viewedAt ? (pv.viewedAt.toDate ? pv.viewedAt.toDate() : new Date(pv.viewedAt)) : new Date();
        return `
          <div class="sh-item ${isUnread(pv.id) ? "sh-unread" : ""}"
               onclick="window._shOpenProfileViewer('${esc(pv.viewerUid)}'); window._shReadItem('${esc(pv.id)}')">
            <div class="sh-icon-box type-view">👤</div>
            <div class="sh-item-body">
              <div class="sh-item-title">${esc(pv.viewerName || "Someone")} viewed your profile</div>
              <div class="sh-item-meta">
                <span class="sh-tag">Profile View</span>
                <span>${timeAgo(ts)}</span>
              </div>
            </div>
            <div class="sh-unread-dot"></div>
          </div>`;
      }).join("");
    }

    if (hasPdfs) {
      html += `<div class="sh-divider">Study Materials</div>`;
      html += allRecent.map(pdf => {
        const emoji = subjectEmoji[pdf.subject] || subjectEmoji.Default;
        let ago = "";
        if (pdf.uploadedAt) {
          const d = pdf.uploadedAt.toDate ? pdf.uploadedAt.toDate() : new Date(pdf.uploadedAt);
          ago = timeAgo(d);
        }
        return `
          <div class="sh-item ${isUnread(pdf.id) ? "sh-unread" : ""}"
               onclick="window._shOpenPdf('${esc(pdf.id)}')">
            <div class="sh-icon-box type-pdf">${emoji}</div>
            <div class="sh-item-body">
              <div class="sh-item-title">${esc(pdf.title || "Untitled")}</div>
              <div class="sh-item-meta">
                <span class="sh-tag">${esc(pdf.subject || "General")}</span>
                ${pdf.level ? `<span>${esc(pdf.level)}</span>` : ""}
                ${ago ? `<span>· ${ago}</span>` : ""}
              </div>
            </div>
            <div class="sh-unread-dot"></div>
          </div>`;
      }).join("");
    }

    list.innerHTML = html;
  }

  /* ── Global click handlers ── */
  window._shReadItem = function (id) {
    markItemRead(id);
    updateBadge();
    renderList();
  };

  window._shOpenFriends = function () {
    closePanel();
    window.location.href = "friends.html?tab=requests";
  };

  window._shOpenProfileViewer = function (uid) {
    closePanel();
    window.location.href = "profile.html?uid=" + encodeURIComponent(uid);
  };

  window._shOpenPdf = function (id) {
    markItemRead(id);
    closePanel();
    window.location.href = "viewer.html?id=" + encodeURIComponent(id);
  };

  /* ══════════════════════════════════════════════════════════
     6.  PANEL OPEN / CLOSE
     ══════════════════════════════════════════════════════════ */
  function togglePanel(e) {
    e.stopPropagation();
    panelOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    panelOpen = true;
    const panel = document.getElementById("sh-panel");
    if (!panel) return;
    /* Use requestAnimationFrame so display:flex is applied before transition fires */
    panel.style.display = "flex";
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        panel.classList.add("sh-open");
      });
    });
    renderList();
  }

  function closePanel() {
    panelOpen = false;
    const panel = document.getElementById("sh-panel");
    if (!panel) return;
    panel.classList.remove("sh-open");
    /* Hide after transition */
    panel.addEventListener("transitionend", function hide() {
      if (!panelOpen) panel.style.display = "";
      panel.removeEventListener("transitionend", hide);
    });
  }

})();