//notifications.js//
(function () {
  "use strict";

  /* ─── constants ─── */
  const LS_READ_IDS = "studyhub_read_ids";
  const MAX_SHOW    = 20;

  /* ─── state ─── */
  let allRecent           = [];
  let friendRequestNotifs = [];
  let profileViewNotifs   = [];
  let waitingRoomNotifs   = [];
  let panelOpen           = false;
  let prevUnreadCount     = 0;
  let currentUserEmail    = null;
  let currentUserUid      = null;
  let downloadRequestNotifs = [];
  const ADMIN_EMAILS      = ["abhishekbasu188@gmail.com"];

  /* ─── read-state helpers ─── */
  function getReadIds() {
    try { return new Set(JSON.parse(localStorage.getItem(LS_READ_IDS) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveReadIds(set) {
    try { localStorage.setItem(LS_READ_IDS, JSON.stringify([...set])); } catch (e) {}
  }
  function markItemRead(id) {
    const ids = getReadIds(); ids.add(id); saveReadIds(ids);
  }
  function markAllRead() {
    const ids = getReadIds();
    [...allRecent, ...friendRequestNotifs, ...profileViewNotifs, ...waitingRoomNotifs]
      .forEach(x => ids.add(x.id));
    saveReadIds(ids);
    updateBadge();
    renderList();
    const btn = document.getElementById("sh-bell-btn");
    if (btn) btn.classList.remove("sh-bell-active");
  }
  function isUnread(id) { return !getReadIds().has(id); }
  function getUnreadItems() {
    return [
      ...allRecent.filter(p => isUnread(p.id)),
      ...friendRequestNotifs.filter(r => isUnread(r.id)),
      ...profileViewNotifs.filter(v => isUnread(v.id)),
      ...waitingRoomNotifs.filter(w => isUnread(w.id)),
      ...downloadRequestNotifs.filter(d => isUnread(d.id)),
    ];
  }
  function pruneReadIds() {
    const allIds = new Set([
      ...allRecent, ...friendRequestNotifs,
      ...profileViewNotifs, ...waitingRoomNotifs,
        ...downloadRequestNotifs,
    ].map(x => x.id));
    const pruned = new Set([...getReadIds()].filter(id => allIds.has(id)));
    saveReadIds(pruned);
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
      #sh-notif-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      #sh-bell-btn {
        position: relative;
        width: 36px; height: 36px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.03);
        color: #7C7A9A;
        font-size: 16px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: color .18s, border-color .18s, background .18s;
        font-family: inherit;
        flex-shrink: 0;
        outline: none;
      }
      #sh-bell-btn:hover {
        color: #ECEDF1;
        border-color: rgba(255,255,255,0.16);
        background: rgba(255,255,255,0.05);
      }
      #sh-bell-btn.sh-bell-active {
        color: #8FA3D6;
        border-color: rgba(91,127,255,0.3);
        background: rgba(91,127,255,0.07);
      }
      #sh-badge {
        position: absolute;
        top: -4px; right: -4px;
        min-width: 17px; height: 17px;
        padding: 0 4px;
        border-radius: 99px;
        background: #C2564F;
        color: #fff;
        font-size: 9.5px; font-weight: 700;
        font-family: 'Inter', system-ui, sans-serif;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid #0E0F12;
        opacity: 0;
        transform: scale(0.6);
        transition: opacity .2s, transform .2s cubic-bezier(0.34,1.4,0.64,1);
        pointer-events: none;
        z-index: 2;
      }
      #sh-badge.sh-badge-visible { opacity: 1; transform: scale(1); }

      @keyframes sh-ring {
        0%   { transform: rotate(0deg); }
        15%  { transform: rotate(-12deg); }
        30%  { transform: rotate(12deg); }
        45%  { transform: rotate(-8deg); }
        60%  { transform: rotate(8deg); }
        75%  { transform: rotate(-4deg); }
        90%  { transform: rotate(4deg); }
        100% { transform: rotate(0deg); }
      }
      #sh-bell-btn.sh-ring i {
        display: inline-block;
        animation: sh-ring .55s ease;
        transform-origin: 50% 0%;
      }

      /* ── Panel ── */
      #sh-panel {
        display: none;
        position: absolute;
        top: calc(100% + 8px); right: 0;
        width: 344px; max-height: 460px;
        background: #111318;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        box-shadow: 0 0 0 1px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.4), 0 24px 56px rgba(0,0,0,.35);
        z-index: 9999;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        transform: translateY(-6px) scale(.985);
        pointer-events: none;
        transition: opacity .16s ease, transform .16s ease;
      }
      #sh-panel.sh-open {
        display: flex;
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .sh-panel-head {
        padding: 13px 14px 11px;
        display: flex; align-items: center; justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        flex-shrink: 0;
      }
      .sh-panel-head-left { display: flex; align-items: center; gap: 8px; }
      .sh-panel-title {
        font-family: 'Source Serif 4', 'Inter', serif;
        font-size: 14px; font-weight: 700;
        color: #ECEDF1; letter-spacing: -.1px;
      }
      .sh-count-pill {
        padding: 2px 7px; border-radius: 5px;
        font-size: 10.5px; font-weight: 700;
        font-family: 'Inter', system-ui, sans-serif;
        letter-spacing: .1px;
        transition: background .2s, color .2s;
      }
      .sh-count-pill.has-new  { background: rgba(91,127,255,0.14); color: #8FA3D6; }
      .sh-count-pill.all-read { background: rgba(78,158,120,0.12); color: #4E9E78; }
      .sh-mark-all-btn {
        font-size: 11px; font-weight: 500;
        color: #62656F; background: none; border: none;
        cursor: pointer; font-family: inherit;
        padding: 4px 8px; border-radius: 6px;
        transition: color .15s, background .15s;
      }
      .sh-mark-all-btn:hover { color: #8FA3D6; background: rgba(91,127,255,0.08); }

      .sh-list {
        overflow-y: auto; flex: 1; padding: 6px;
        scrollbar-width: thin;
        scrollbar-color: rgba(91,127,255,0.3) transparent;
      }
      .sh-list::-webkit-scrollbar { width: 3px; }
      .sh-list::-webkit-scrollbar-thumb { background: rgba(91,127,255,0.3); border-radius: 99px; }

      .sh-divider {
        padding: 8px 10px 4px;
        font-size: 10px; font-weight: 700;
        text-transform: uppercase; letter-spacing: .9px;
        color: #3E3C56;
        font-family: 'Inter', system-ui, sans-serif;
      }

      .sh-item {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 10px; border-radius: 8px;
        cursor: pointer;
        transition: background .12s;
        position: relative;
      }
      .sh-item:hover { background: rgba(255,255,255,0.03); }
      .sh-item.sh-unread { background: rgba(91,127,255,0.05); }
      .sh-item.sh-unread:hover { background: rgba(91,127,255,0.09); }

      .sh-item.sh-waiting { background: rgba(201,163,86,0.05); }
      .sh-item.sh-waiting:hover { background: rgba(201,163,86,0.09); }
      .sh-item.sh-waiting.sh-unread { background: rgba(201,163,86,0.08); }

      .sh-icon-box {
        width: 34px; height: 34px; border-radius: 7px;
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 15px; color: #9498A6;
      }
      .sh-icon-box.type-pdf     { background: rgba(91,127,255,0.1); }
      .sh-icon-box.type-friend  { background: rgba(78,158,120,0.1); }
      .sh-icon-box.type-view    { background: rgba(63,169,204,0.1); }
      .sh-icon-box.type-waiting { background: rgba(201,163,86,0.12); }

      .sh-item-body { flex: 1; min-width: 0; }
      .sh-item-title {
        font-size: 12.5px; font-weight: 600;
        color: #C8C6E0; line-height: 1.4;
        margin-bottom: 3px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        letter-spacing: -.1px;
      }
      .sh-item.sh-unread .sh-item-title { color: #ECEDF1; }
      .sh-item-meta {
        font-size: 11px; color: #4A4866;
        display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
      }
      .sh-tag {
        padding: 1px 6px; border-radius: 4px;
        background: rgba(255,255,255,0.05);
        color: #62656F; font-size: 10px; font-weight: 600;
      }
      .sh-tag.waiting { background: rgba(201,163,86,0.12); color: #C9A356; }
      .sh-tag.friend  { background: rgba(78,158,120,0.12); color: #4E9E78; }
      .sh-tag.view    { background: rgba(63,169,204,0.10); color: #3FA9CC; }

      .sh-action-row {
        display: flex; gap: 6px; margin-top: 7px;
      }
      .sh-action-btn {
        padding: 5px 12px; border-radius: 6px;
        font-size: 11.5px; font-weight: 600;
        cursor: pointer; font-family: inherit;
        transition: background .15s, color .15s;
        border: 1px solid transparent;
        display: inline-flex; align-items: center; gap: 5px;
      }
      .sh-action-btn.approve {
        background: rgba(78,158,120,0.12);
        color: #4E9E78;
        border-color: rgba(78,158,120,0.25);
      }
      .sh-action-btn.approve:hover { background: rgba(78,158,120,0.22); }
      .sh-action-btn.reject {
        background: rgba(194,86,79,0.08);
        color: #C2564F;
        border-color: rgba(194,86,79,0.2);
      }
      .sh-action-btn.reject:hover { background: rgba(194,86,79,0.16); }

      .sh-unread-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #5B7FFF; flex-shrink: 0; margin-top: 6px;
        opacity: 0; transition: opacity .15s;
      }
      .sh-item.sh-unread .sh-unread-dot { opacity: 1; }
      .sh-item.sh-waiting.sh-unread .sh-unread-dot { background: #C9A356; }

      .sh-empty {
        padding: 40px 20px; text-align: center;
        color: #3E3C56; font-size: 13px;
        font-family: 'Inter', system-ui, sans-serif; line-height: 1.6;
      }
      .sh-empty-icon { font-size: 26px; margin-bottom: 12px; display: block; opacity: .4; }
      .sh-empty p { color: #4A4866; font-size: 12.5px; }

      .sh-panel-foot {
        padding: 8px;
        border-top: 1px solid rgba(255,255,255,0.05);
        flex-shrink: 0;
      }
      .sh-foot-link {
        display: block; text-align: center;
        font-size: 12px; font-weight: 500; color: #4A4866;
        text-decoration: none; padding: 8px; border-radius: 7px;
        transition: background .15s, color .15s;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .sh-foot-link:hover { background: rgba(255,255,255,0.04); color: #8FA3D6; }

      /* ── Waiting room toast (admin only) ── */
      .sh-waiting-toast {
        position: fixed; bottom: 24px; right: 24px; z-index: 9998;
        width: 320px;
        background: #111318;
        border: 1px solid rgba(201,163,86,0.28);
        border-radius: 10px;
        padding: 14px 14px 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,.5);
        display: flex; flex-direction: column; gap: 10px;
        font-family: 'Inter', system-ui, sans-serif;
        animation: sh-toast-slide .25s ease;
      }
      @keyframes sh-toast-slide {
        from { opacity:0; transform:translateY(10px); }
        to   { opacity:1; transform:translateY(0); }
      }
      .sh-toast-head {
        display: flex; align-items: center; gap: 10px;
      }
      .sh-toast-icon {
        width: 36px; height: 36px; border-radius: 8px;
        background: rgba(201,163,86,0.12);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; font-size: 16px; color: #C9A356;
      }
      .sh-toast-body { flex: 1; min-width: 0; }
      .sh-toast-title {
        font-size: 13px; font-weight: 700; color: #ECEDF1;
        margin-bottom: 2px; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
      }
      .sh-toast-sub { font-size: 11.5px; color: #9498A6; }
      .sh-toast-close {
        background: none; border: none; color: #62656F;
        font-size: 15px; cursor: pointer; flex-shrink: 0;
        padding: 2px; line-height: 1;
        transition: color .15s;
      }
      .sh-toast-close:hover { color: #ECEDF1; }
      .sh-toast-actions { display: flex; gap: 8px; }
      .sh-toast-btn {
        flex: 1; padding: 7px; border-radius: 7px;
        font-size: 12px; font-weight: 600; cursor: pointer;
        font-family: inherit; border: 1px solid transparent;
        transition: background .15s;
        display: flex; align-items: center; justify-content: center; gap: 5px;
      }
      .sh-toast-btn.approve {
        background: rgba(78,158,120,0.14); color: #4E9E78;
        border-color: rgba(78,158,120,0.28);
      }
      .sh-toast-btn.approve:hover { background: rgba(78,158,120,0.24); }
      .sh-toast-btn.reject {
        background: rgba(194,86,79,0.08); color: #C2564F;
        border-color: rgba(194,86,79,0.2);
      }
      .sh-toast-btn.reject:hover { background: rgba(194,86,79,0.16); }

      @media (max-width: 768px) {
        #sh-panel {
          position: fixed !important;
          top: 64px !important;
          left: 10px !important; right: 10px !important;
          width: calc(100vw - 20px) !important;
          max-height: 68vh !important;
          border-radius: 10px !important;
        }
        .sh-waiting-toast { width: calc(100vw - 32px); right: 16px; bottom: 16px; }
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
      <div class="sh-list" id="sh-list"><div style="padding:30px 20px;text-align:center;color:#3E3C56;font-size:12.5px">Loading…</div></div>
      <div class="sh-panel-foot">
        <a href="index.html#materials" class="sh-foot-link">Browse all materials →</a>
      </div>`;

    wrap.appendChild(btn);
    wrap.appendChild(panel);

    const bellSlot = document.getElementById("bellSlot");
    if (bellSlot) bellSlot.appendChild(wrap);
    else {
      const nr = nav.querySelector(".nav-right");
      nr ? nr.insertBefore(wrap, nr.firstChild) : nav.appendChild(wrap);
    }

    document.addEventListener("click", e => { if (!wrap.contains(e.target)) closePanel(); });
    window._shMarkAll = markAllRead;
  }

  /* ══════════════════════════════════════════════════════════
     3.  FIRESTORE SUBSCRIPTIONS
  ══════════════════════════════════════════════════════════ */
  function subscribeToFirestore() {
    if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) {
      setTimeout(subscribeToFirestore, 300); return;
    }

    const db = firebase.firestore();

    /* ── PDFs (everyone) ── */
    db.collection("pdfs")
      .orderBy("uploadedAt", "desc")
      .limit(MAX_SHOW)
      .onSnapshot(snap => {
        allRecent = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
        pruneReadIds(); updateBadge(); renderList();
      }, err => console.warn("[Notif] pdfs:", err.message));

    /* ── Auth-gated ── */
    firebase.auth().onAuthStateChanged(user => {
      if (!user) return;
      currentUserEmail = user.email;
      currentUserUid   = user.uid;

      syncUserProfile(user);

      /* Friend requests */
      db.collection("friendRequests")
        .where("to", "==", user.uid)
        .where("status", "==", "pending")
        .onSnapshot(snap => {
          friendRequestNotifs = snap.docs.map(d => Object.assign({ id: d.id, _type: "friendRequest" }, d.data()));
          pruneReadIds(); updateBadge(); renderList();
        }, err => console.warn("[Notif] friendRequests:", err.message));

      /* Profile views */
      db.collection("profileViews")
        .where("profileOwnerUid", "==", user.uid)
        .orderBy("viewedAt", "desc")
        .limit(MAX_SHOW)
        .onSnapshot(snap => {
          profileViewNotifs = snap.docs.map(d => Object.assign({ id: d.id, _type: "profileView" }, d.data()));
          pruneReadIds(); updateBadge(); renderList();
        }, err => console.warn("[Notif] profileViews:", err.message));

      /* ── Waiting room (admin only) ── */
      if (ADMIN_EMAILS.includes(user.email)) {
        subscribeWaitingRoom(db);
        subscribeDownloadRequests(db);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     ★  FIXED: Waiting Room Subscription
     
     Two bugs were here:
     1. `if (data.requestedAt)` failed because serverTimestamp()
        returns null in the first (pending-write) snapshot.
     2. No initialLoad guard — ALL existing docs fired as "added"
        on first subscription, causing false toasts.
  ══════════════════════════════════════════════════════════ */
  function subscribeWaitingRoom(db) {
    let initialLoad = true;   /* ← FIX 1: skip toasts for the first batch */

    db.collection("waitingRoom")
      .where("status", "==", "waiting")
      .orderBy("requestedAt", "desc")
      .onSnapshot(snap => {
        const prev = new Set(waitingRoomNotifs.map(w => w.id));

        waitingRoomNotifs = snap.docs.map(d => Object.assign({ id: d.id, _type: "waitingRoom" }, d.data()));

        if (!initialLoad) {
          snap.docChanges().forEach(change => {
            if (change.type !== "added") return;
            if (prev.has(change.doc.id)) return;

            const data = change.doc.data();

            /*
             * FIX 2: serverTimestamp() is null on the first (pending-write)
             * snapshot — the server hasn't resolved it yet.
             * A null requestedAt means the doc was JUST written, so treat
             * it as "now" (age = 0, definitely recent).
             */
            let isRecent;
            if (!data.requestedAt) {
              /* Pending write — document was literally just added */
              isRecent = true;
            } else {
              const ts  = data.requestedAt.toDate ? data.requestedAt.toDate() : new Date(data.requestedAt);
              const age = Date.now() - ts.getTime();
              isRecent  = age < 30000; /* 30 s window (generous for slow connections) */
            }

            if (isRecent) {
              showWaitingToast(change.doc.id, data);
              ringBell();
            }
          });
        }

        initialLoad = false;   /* ← after first snapshot, enable toasts */
        pruneReadIds(); updateBadge(); renderList();
      }, err => console.warn("[Notif] waitingRoom:", err.message));
  }

 function subscribeDownloadRequests(db) {
    let initialLoad = true;

    db.collection('downloadRequests')
      .where('status', '==', 'pending')
      .orderBy('requestedAt', 'desc')
      .onSnapshot(snap => {
        downloadRequestNotifs = snap.docs.map(d => ({id: d.id, _type: 'downloadRequest', ...d.data()}));

        if (!initialLoad) {
          snap.docChanges().forEach(change => {
            if (change.type !== 'added') return;
            const data = change.doc.data();
            const docId = change.doc.id;
            let isRecent = !data.requestedAt || (Date.now() - (data.requestedAt.toDate?.() || new Date(data.requestedAt)).getTime() < 30000);
            if (isRecent) { showDownloadToast(docId, data); ringBell(); }
          });
        }
        initialLoad = false;
        pruneReadIds(); updateBadge(); renderList();
      }, err => console.warn('[Notif] downloadRequests:', err.message));
  }

  function showDownloadToast(docId, data) {
    const existing = document.getElementById('sh-dt-' + docId);
    if (existing) existing.remove();

    const name = esc(data.userName || data.userEmail || 'Someone');
    const file = esc(data.fileName || 'a file');

    const t = document.createElement('div');
    t.className = 'sh-waiting-toast';
    t.id = 'sh-dt-' + docId;
    t.innerHTML = `
      <div class="sh-toast-head">
        <div class="sh-toast-icon"><i class="ti ti-download"></i></div>
        <div class="sh-toast-body">
          <div class="sh-toast-title">${name} wants to download</div>
          <div class="sh-toast-sub">${file} · Just now</div>
        </div>
        <button class="sh-toast-close" onclick="document.getElementById('sh-dt-${docId}')?.remove()">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="sh-toast-actions">
        <button class="sh-toast-btn approve"
          onclick="window._shApproveDownload('${docId}','${esc(data.uid)}','${esc(data.fileId)}',this);document.getElementById('sh-dt-${docId}')?.remove()">
          <i class="ti ti-check"></i> Approve
        </button>
        <button class="sh-toast-btn reject"
          onclick="window._shRejectDownload('${docId}',this);document.getElementById('sh-dt-${docId}')?.remove()">
          <i class="ti ti-x"></i> Deny
        </button>
      </div>`;
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentElement) t.remove(); }, 12000);
  }

  function syncUserProfile(user) {
    firebase.firestore().collection("userProfiles").doc(user.uid).set({
      uid: user.uid,
      displayName: user.displayName || user.email.split("@")[0],
      email: user.email,
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => console.warn("[Notif] userProfile:", err.message));
  }

  /* ══════════════════════════════════════════════════════════
     4.  BADGE
  ══════════════════════════════════════════════════════════ */
  function ringBell() {
    const btn = document.getElementById("sh-bell-btn");
    if (!btn) return;
    btn.classList.remove("sh-ring");
    void btn.offsetWidth;
    btn.classList.add("sh-ring");
    btn.addEventListener("animationend", () => btn.classList.remove("sh-ring"), { once: true });
  }

  function updateBadge() {
    const badge = document.getElementById("sh-badge");
    const btn   = document.getElementById("sh-bell-btn");
    const pill  = document.getElementById("sh-count-pill");
    if (!badge || !btn) return;

    const count = getUnreadItems().length;

    if (pill) {
      pill.textContent = count > 0 ? count + " new" : "All read";
      pill.className   = "sh-count-pill " + (count > 0 ? "has-new" : "all-read");
    }

    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.classList.add("sh-badge-visible");
      btn.classList.add("sh-bell-active");
      if (count > prevUnreadCount && document.visibilityState !== "hidden") ringBell();
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
    const d = Math.floor((Date.now() - date.getTime()) / 1000);
    if (d < 60) return "just now";
    if (d < 3600) return Math.floor(d/60) + "m ago";
    if (d < 86400) return Math.floor(d/3600) + "h ago";
    if (d < 604800) return Math.floor(d/86400) + "d ago";
    return date.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  }

  function esc(str) {
    return String(str||"")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function generateSecurityCode() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SH-${t}-${r}`;
  }

  function renderList() {
    const list = document.getElementById("sh-list");
    if (!list) return;

    const isAdmin = ADMIN_EMAILS.includes(currentUserEmail);

    const hasWaiting = isAdmin && waitingRoomNotifs.length > 0;
    const hasFriends = friendRequestNotifs.length > 0;
    const hasViews   = profileViewNotifs.length > 0;
    const hasPdfs    = allRecent.length > 0;

    if (!hasWaiting && !hasFriends && !hasViews && !hasPdfs) {
      list.innerHTML = `
        <div class="sh-empty">
          <span class="sh-empty-icon"><i class="ti ti-inbox" style="font-size:26px"></i></span>
          <p>Nothing here yet.</p>
        </div>`;
      return;
    }

    let html = "";

    /* ── Waiting Room (admin) ── */
    if (hasWaiting) {
      html += `<div class="sh-divider">Waiting Room</div>`;
      html += waitingRoomNotifs.map(w => {
        const ts  = w.requestedAt ? (w.requestedAt.toDate?.() || new Date(w.requestedAt)) : new Date();
        const ago = timeAgo(ts);
        const unread = isUnread(w.id);
        return `
          <div class="sh-item sh-waiting ${unread ? "sh-unread" : ""}"
               onclick="window._shReadItem('${esc(w.id)}')">
            <div class="sh-icon-box type-waiting">
              <i class="ti ti-door-enter" style="font-size:16px;color:#C9A356"></i>
            </div>
            <div class="sh-item-body">
              <div class="sh-item-title">${esc(w.name || w.userName || w.userEmail || "Someone")} wants to join</div>
              <span>${esc(w.roomName || w.room || "Study Room")}</span>
              <div class="sh-item-meta">
                <span class="sh-tag waiting">Waiting Room</span>
                <span>${esc(w.room || "Study Room")}</span>
                <span>· ${ago}</span>
              </div>
              <div class="sh-action-row">
                <button class="sh-action-btn approve"
                  onclick="event.stopPropagation(); window._shApproveWaiting('${esc(w.id)}', this)">
                  <i class="ti ti-check" style="font-size:12px"></i> Approve
                </button>
                <button class="sh-action-btn reject"
                  onclick="event.stopPropagation(); window._shRejectWaiting('${esc(w.id)}', this)">
                  <i class="ti ti-x" style="font-size:12px"></i> Reject
                </button>
              </div>
            </div>
            <div class="sh-unread-dot"></div>
          </div>`;
      }).join("");
    }

    /* ── Download Requests (admin) ── */
    if (isAdmin && downloadRequestNotifs.length > 0) {
      html += `<div class="sh-divider">Download Requests</div>`;
      html += downloadRequestNotifs.map(d => {
        const ts  = d.requestedAt ? (d.requestedAt.toDate?.() || new Date(d.requestedAt)) : new Date();
        const ago = timeAgo(ts);
        const unread = isUnread(d.id);
        return `
          <div class="sh-item sh-waiting ${unread ? 'sh-unread' : ''}"
               onclick="window._shReadItem('${esc(d.id)}')">
            <div class="sh-icon-box type-waiting">
              <i class="ti ti-download" style="font-size:16px;color:#C9A356"></i>
            </div>
            <div class="sh-item-body">
              <div class="sh-item-title">${esc(d.userName || d.userEmail || 'Someone')} wants to download</div>
              <div class="sh-item-meta">
                <span class="sh-tag waiting">Download Request</span>
                <span>${esc(d.fileName || 'a file')}</span>
                <span>· ${ago}</span>
              </div>
              <div class="sh-action-row">
                <button class="sh-action-btn approve"
                  onclick="event.stopPropagation(); window._shApproveDownload('${esc(d.id)}','${esc(d.uid)}','${esc(d.fileId)}', this)">
                  <i class="ti ti-check" style="font-size:12px"></i> Approve
                </button>
                <button class="sh-action-btn reject"
                  onclick="event.stopPropagation(); window._shRejectDownload('${esc(d.id)}', this)">
                  <i class="ti ti-x" style="font-size:12px"></i> Deny
                </button>
              </div>
            </div>
            <div class="sh-unread-dot"></div>
          </div>`;
      }).join('');
    }

    window._shRejectDownload = async function(docId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Rejecting…'; }
  try {
    await firebase.firestore().collection('downloadRequests').doc(docId).update({
      status: 'rejected',
      resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      resolvedBy: currentUserEmail,
    });
    markItemRead(docId);
    updateBadge();
    renderList();
  } catch(e) {
    console.error('[Notif] reject download error:', e);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-x"></i> Deny'; }
  }
};

    /* ── Friend Requests ── */
    if (hasFriends) {
      html += `<div class="sh-divider">Friend Requests</div>`;
      html += friendRequestNotifs.map(req => {
        const unread = isUnread(req.id);
        return `
          <div class="sh-item ${unread ? "sh-unread" : ""}"
               onclick="window._shOpenFriends(); window._shReadItem('${esc(req.id)}')">
            <div class="sh-icon-box type-friend">
              <i class="ti ti-user-plus" style="font-size:15px;color:#4E9E78"></i>
            </div>
            <div class="sh-item-body">
              <div class="sh-item-title">${esc(req.fromName || "Someone")} sent you a friend request</div>
              <div class="sh-item-meta">
                <span class="sh-tag friend">Friend Request</span>
                <span>Tap to respond</span>
              </div>
            </div>
            <div class="sh-unread-dot"></div>
          </div>`;
      }).join("");
    }

    /* ── Profile Views ── */
    if (hasViews) {
      html += `<div class="sh-divider">Profile Views</div>`;
      html += profileViewNotifs.map(pv => {
        const ts  = pv.viewedAt ? (pv.viewedAt.toDate?.() || new Date(pv.viewedAt)) : new Date();
        const unread = isUnread(pv.id);
        return `
          <div class="sh-item ${unread ? "sh-unread" : ""}"
               onclick="window._shOpenProfileViewer('${esc(pv.viewerUid)}'); window._shReadItem('${esc(pv.id)}')">
            <div class="sh-icon-box type-view">
              <i class="ti ti-eye" style="font-size:15px;color:#3FA9CC"></i>
            </div>
            <div class="sh-item-body">
              <div class="sh-item-title">${esc(pv.viewerName || "Someone")} viewed your profile</div>
              <div class="sh-item-meta">
                <span class="sh-tag view">Profile View</span>
                <span>${timeAgo(ts)}</span>
              </div>
            </div>
            <div class="sh-unread-dot"></div>
          </div>`;
      }).join("");
    }

    /* ── PDFs ── */
    if (hasPdfs) {
      html += `<div class="sh-divider">Study Materials</div>`;
      html += allRecent.map(pdf => {
        const emoji = subjectEmoji[pdf.subject] || subjectEmoji.Default;
        const unread = isUnread(pdf.id);
        let ago = "";
        if (pdf.uploadedAt) {
          const d = pdf.uploadedAt.toDate ? pdf.uploadedAt.toDate() : new Date(pdf.uploadedAt);
          ago = timeAgo(d);
        }
        return `
          <div class="sh-item ${unread ? "sh-unread" : ""}"
               onclick="window._shOpenPdf('${esc(pdf.id)}')">
            <div class="sh-icon-box type-pdf" style="font-size:17px">${emoji}</div>
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

  /* ══════════════════════════════════════════════════════════
     6.  WAITING ROOM TOAST (admin only)
  ══════════════════════════════════════════════════════════ */
  function showWaitingToast(docId, data) {
    const existing = document.getElementById("sh-wt-" + docId);
    if (existing) existing.remove();

    const name = esc(data.name || data.userName || data.userEmail || "Someone");
    const room = esc(data.roomName || data.room || "Study Room");

    const t = document.createElement("div");
    t.className = "sh-waiting-toast";
    t.id = "sh-wt-" + docId;
    t.innerHTML = `
      <div class="sh-toast-head">
        <div class="sh-toast-icon"><i class="ti ti-door-enter"></i></div>
        <div class="sh-toast-body">
          <div class="sh-toast-title">${name} wants to join</div>
          <div class="sh-toast-sub">${room} · Just now</div>
        </div>
        <button class="sh-toast-close" onclick="document.getElementById('sh-wt-${docId}')?.remove()">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="sh-toast-actions">
        <button class="sh-toast-btn approve"
          onclick="window._shApproveWaiting('${docId}', this); document.getElementById('sh-wt-${docId}')?.remove()">
          <i class="ti ti-check"></i> Approve
        </button>
        <button class="sh-toast-btn reject"
          onclick="window._shRejectWaiting('${docId}', this); document.getElementById('sh-wt-${docId}')?.remove()">
          <i class="ti ti-x"></i> Reject
        </button>
      </div>`;
    document.body.appendChild(t);

    setTimeout(() => { if (t.parentElement) t.remove(); }, 12000);
  }

  /* ── Approve / Reject handlers ── */
window._shApproveDownload = async function(reqId, uid, fileId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
  try {
    const db = firebase.firestore();
    const batch = db.batch();
    const securityCode = generateSecurityCode();

    batch.update(db.collection('downloadRequests').doc(reqId), {
      status: 'approved',
      resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      resolvedBy: currentUserEmail,
      securityCode: securityCode,          // ← new
    });

    const accessDocId = uid + '_' + fileId;
    batch.set(db.collection('downloadAccess').doc(accessDocId), {
      uid: uid,
      fileId: fileId,
      grantedAt: firebase.firestore.FieldValue.serverTimestamp(),
      grantedBy: currentUserEmail,
      securityCode: securityCode,          // ← new
    }, { merge: true });

    await batch.commit();
    markItemRead(reqId);
    updateBadge();
    renderList();
    showApprovalToast('Access granted ✓ Code: ' + securityCode);
  } catch(e) {
    console.error('[Notif] approve download error:', e);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Approve'; }
  }
};

window._shApproveWaiting = async function(docId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
  try {
    await firebase.firestore().collection('waitingRoom').doc(docId).update({
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUserEmail,
    });
    markItemRead(docId);
    updateBadge();
    renderList();
  } catch(e) {
    console.error('[Notif] approve waiting error:', e);
    if (btn) { 
      btn.disabled = false; 
      btn.innerHTML = '<i class="ti ti-check"></i> Approve'; 
    }
  }
};

  window._shRejectWaiting = async function(docId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Rejecting…"; }
    try {
      await firebase.firestore().collection("waitingRoom").doc(docId).update({
        status: "rejected",
        rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
        rejectedBy: currentUserEmail
      });
      markItemRead(docId);
      updateBadge();
      renderList();
    } catch(e) { console.error("[Notif] reject error:", e); if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-x"></i> Reject';} }
  };

  /* ── Other handlers ── */
  window._shReadItem = function(id) { markItemRead(id); updateBadge(); renderList(); };
  window._shOpenFriends = function() { closePanel(); window.location.href = "friends.html?tab=requests"; };
  window._shOpenProfileViewer = function(uid) { closePanel(); window.location.href = "profile.html?uid=" + encodeURIComponent(uid); };
  window._shOpenPdf = function(id) { markItemRead(id); closePanel(); window.location.href = "viewer.html?id=" + encodeURIComponent(id); };
  window._shOpenWaiting = function(id) { markItemRead(id); closePanel(); window.location.href = "admin.html#waiting"; };

  /* ══════════════════════════════════════════════════════════
     7.  PANEL OPEN / CLOSE
  ══════════════════════════════════════════════════════════ */
  function togglePanel(e) { e.stopPropagation(); panelOpen ? closePanel() : openPanel(); }

  function openPanel() {
    panelOpen = true;
    const panel = document.getElementById("sh-panel");
    if (!panel) return;
    panel.style.display = "flex";
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add("sh-open")));
    renderList();
  }

  function closePanel() {
    panelOpen = false;
    const panel = document.getElementById("sh-panel");
    if (!panel) return;
    panel.classList.remove("sh-open");
    panel.addEventListener("transitionend", function hide() {
      if (!panelOpen) panel.style.display = "";
      panel.removeEventListener("transitionend", hide);
    });
  }

function showApprovalToast(msg) {
    // Try to reuse existing toast element on the page
    const t = document.getElementById('toast');
    if (t) {
      const msgEl = document.getElementById('toastMsg');
      const iconEl = document.getElementById('toastIcon');
      if (msgEl) msgEl.textContent = msg;
      if (iconEl) iconEl.className = 'ti ti-check';
      t.className = 'toast success show';
      setTimeout(() => t.classList.remove('show'), 3000);
    }
  }

})();