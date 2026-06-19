/**
 * StudyHub Friends & Follow System
 * ==================================
 * Firestore collections used:
 *
 *  friendRequests/{requestId}
 *    from: uid, fromName, fromEmail
 *    to:   uid, toName, toEmail
 *    status: "pending" | "accepted" | "declined"
 *    createdAt: timestamp
 *
 *  friendships/{friendshipId}   (created when request accepted)
 *    users: [uid1, uid2]        (always sorted for easy querying)
 *    createdAt: timestamp
 *
 *  follows/{followId}
 *    followerId: uid
 *    followingId: uid
 *    followerName: string
 *    followingName: string
 *    createdAt: timestamp
 *
 * USAGE — add to any page after Firebase SDKs:
 *   <script src="friends.js"></script>
 *
 * Then call:
 *   SHFriends.init(currentUser)   — call after auth
 *   SHFriends.renderButton(targetUid, targetName, targetEmail, containerEl)
 *   SHFriends.openFriendsPage()   — navigate to friends.html
 */
//friends.js
window.SHFriends = (function () {
  "use strict";

  let db, currentUser;

  function init(user) {
    if (!user) return;
    currentUser = user;
    if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length) {
      db = firebase.firestore();
    }
  }

  /* ─────────────────────────────────────────
     FRIENDSHIP HELPERS
  ───────────────────────────────────────── */

  // sorted pair so we can query consistently
  function pairId(a, b) {
    return [a, b].sort().join("_");
  }

  async function getFriendshipStatus(targetUid) {
    if (!currentUser || !db) return "none";
    const myUid = currentUser.uid;

    // Check if already friends
    const fs = await db.collection("friendships")
      .where("users", "array-contains", myUid)
      .get();
    const isFriend = fs.docs.some(d => d.data().users.includes(targetUid));
    if (isFriend) return "friends";

    // Check pending sent
    const sent = await db.collection("friendRequests")
      .where("from", "==", myUid)
      .where("to", "==", targetUid)
      .where("status", "==", "pending")
      .get();
    if (!sent.empty) return "pending_sent";

    // Check pending received
    const recv = await db.collection("friendRequests")
      .where("from", "==", targetUid)
      .where("to", "==", myUid)
      .where("status", "==", "pending")
      .get();
    if (!recv.empty) return "pending_received";

    return "none";
  }

  async function getFollowStatus(targetUid) {
    if (!currentUser || !db) return false;
    const snap = await db.collection("follows")
      .where("followerId", "==", currentUser.uid)
      .where("followingId", "==", targetUid)
      .get();
    return !snap.empty;
  }

  async function sendFriendRequest(targetUid, targetName, targetEmail) {
    if (!currentUser || !db) return;
    await db.collection("friendRequests").add({
      from: currentUser.uid,
      fromName: currentUser.displayName || currentUser.email,
      fromEmail: currentUser.email,
      to: targetUid,
      toName: targetName,
      toEmail: targetEmail,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function cancelFriendRequest(targetUid) {
    if (!currentUser || !db) return;
    const snap = await db.collection("friendRequests")
      .where("from", "==", currentUser.uid)
      .where("to", "==", targetUid)
      .where("status", "==", "pending")
      .get();
    snap.docs.forEach(d => d.ref.delete());
  }

  async function acceptFriendRequest(fromUid) {
    if (!currentUser || !db) return;
    const snap = await db.collection("friendRequests")
      .where("from", "==", fromUid)
      .where("to", "==", currentUser.uid)
      .where("status", "==", "pending")
      .get();
    if (snap.empty) return;
    const reqRef = snap.docs[0].ref;
    const reqData = snap.docs[0].data();
    await reqRef.update({ status: "accepted" });
    await db.collection("friendships").add({
      users: [currentUser.uid, fromUid].sort(),
      names: {
        [currentUser.uid]: currentUser.displayName || currentUser.email,
        [fromUid]: reqData.fromName,
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function declineFriendRequest(fromUid) {
    if (!currentUser || !db) return;
    const snap = await db.collection("friendRequests")
      .where("from", "==", fromUid)
      .where("to", "==", currentUser.uid)
      .where("status", "==", "pending")
      .get();
    snap.docs.forEach(d => d.ref.update({ status: "declined" }));
  }

  async function unfriend(targetUid) {
    if (!currentUser || !db) return;
    const snap = await db.collection("friendships")
      .where("users", "array-contains", currentUser.uid)
      .get();
    snap.docs.forEach(d => {
      if (d.data().users.includes(targetUid)) d.ref.delete();
    });
  }

  async function toggleFollow(targetUid, targetName) {
    if (!currentUser || !db) return false;
    const snap = await db.collection("follows")
      .where("followerId", "==", currentUser.uid)
      .where("followingId", "==", targetUid)
      .get();
    if (snap.empty) {
      await db.collection("follows").add({
        followerId: currentUser.uid,
        followerName: currentUser.displayName || currentUser.email,
        followerEmail: currentUser.email,
        followingId: targetUid,
        followingName: targetName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return true; // now following
    } else {
      snap.docs.forEach(d => d.ref.delete());
      return false; // unfollowed
    }
  }

  /* ─────────────────────────────────────────
     RENDER BUTTON (for profile.html)
  ───────────────────────────────────────── */

  async function renderButton(targetUid, targetName, targetEmail, container) {
    if (!container) return;
    container.innerHTML = _loadingHtml();

    const [friendStatus, isFollowing] = await Promise.all([
      getFriendshipStatus(targetUid),
      getFollowStatus(targetUid),
    ]);

    container.innerHTML = _buildButtons(
      targetUid, targetName, targetEmail, friendStatus, isFollowing
    );
  }

  function _loadingHtml() {
    return `<div style="display:flex;gap:10px">
      <div style="width:120px;height:40px;border-radius:12px;background:rgba(255,255,255,0.05);animation:shimmer 1.5s infinite"></div>
      <div style="width:100px;height:40px;border-radius:12px;background:rgba(255,255,255,0.05);animation:shimmer 1.5s infinite"></div>
    </div>`;
  }

  function _buildButtons(uid, name, email, friendStatus, isFollowing) {
    const safeUid   = encodeURIComponent(uid);
    const safeName  = encodeURIComponent(name);
    const safeEmail = encodeURIComponent(email);

    let friendBtn = "";
    if (friendStatus === "friends") {
      friendBtn = `
        <button class="sh-friends-btn sh-friends-btn--friends"
          onclick="SHFriends._unfriendClick('${safeUid}','${safeName}','${safeEmail}',this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
          Friends
        </button>`;
    } else if (friendStatus === "pending_sent") {
      friendBtn = `
        <button class="sh-friends-btn sh-friends-btn--pending"
          onclick="SHFriends._cancelRequest('${safeUid}',this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Request Sent
        </button>`;
    } else if (friendStatus === "pending_received") {
      friendBtn = `
        <button class="sh-friends-btn sh-friends-btn--accept"
          onclick="SHFriends._acceptClick('${safeUid}',this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Accept Request
        </button>`;
    } else {
      friendBtn = `
        <button class="sh-friends-btn sh-friends-btn--add"
          onclick="SHFriends._sendRequest('${safeUid}','${safeName}','${safeEmail}',this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          Add Friend
        </button>`;
    }

    const followLabel = isFollowing ? "Following" : "Follow";
    const followClass = isFollowing ? "sh-friends-btn--following" : "sh-friends-btn--follow";

    const followBtn = `
      <button class="sh-friends-btn ${followClass}"
        onclick="SHFriends._toggleFollowClick('${safeUid}','${safeName}',this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        ${followLabel}
      </button>`;

    return `<div style="display:flex;gap:10px;flex-wrap:wrap">${friendBtn}${followBtn}</div>`;
  }

  /* ─────────────────────────────────────────
     CLICK HANDLERS (called from inline HTML)
  ───────────────────────────────────────── */

  window.SHFriends = window.SHFriends || {};

  async function _sendRequest(encUid, encName, encEmail, btn) {
    const uid   = decodeURIComponent(encUid);
    const name  = decodeURIComponent(encName);
    const email = decodeURIComponent(encEmail);
    btn.disabled = true;
    btn.textContent = "Sending…";
    await sendFriendRequest(uid, name, email);
    btn.outerHTML = `
      <button class="sh-friends-btn sh-friends-btn--pending"
        onclick="SHFriends._cancelRequest('${encUid}',this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Request Sent
      </button>`;
    _toast("Friend request sent! 🎉");
  }

  async function _cancelRequest(encUid, btn) {
    const uid = decodeURIComponent(encUid);
    btn.disabled = true;
    btn.textContent = "Cancelling…";
    await cancelFriendRequest(uid);
    btn.outerHTML = `
      <button class="sh-friends-btn sh-friends-btn--add"
        onclick="SHFriends._sendRequest('${encUid}','','',this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        Add Friend
      </button>`;
    _toast("Request cancelled");
  }

  async function _acceptClick(encUid, btn) {
    const uid = decodeURIComponent(encUid);
    btn.disabled = true;
    btn.textContent = "Accepting…";
    await acceptFriendRequest(uid);
    btn.outerHTML = `
      <button class="sh-friends-btn sh-friends-btn--friends"
        onclick="SHFriends._unfriendClick('${encUid}','','',this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
        Friends
      </button>`;
    _toast("You are now friends! 🎉");
  }

  async function _unfriendClick(encUid, encName, encEmail, btn) {
    if (!confirm("Remove this friend?")) return;
    const uid = decodeURIComponent(encUid);
    btn.disabled = true;
    await unfriend(uid);
    btn.outerHTML = `
      <button class="sh-friends-btn sh-friends-btn--add"
        onclick="SHFriends._sendRequest('${encUid}','${encName}','${encEmail}',this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        Add Friend
      </button>`;
    _toast("Friend removed");
  }

  async function _toggleFollowClick(encUid, encName, btn) {
    const uid  = decodeURIComponent(encUid);
    const name = decodeURIComponent(encName);
    btn.disabled = true;
    const nowFollowing = await toggleFollow(uid, name);
    const encU = encUid, encN = encName;
    btn.outerHTML = `
      <button class="sh-friends-btn ${nowFollowing ? "sh-friends-btn--following" : "sh-friends-btn--follow"}"
        onclick="SHFriends._toggleFollowClick('${encU}','${encN}',this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        ${nowFollowing ? "Following" : "Follow"}
      </button>`;
    _toast(nowFollowing ? "Following! 🔔" : "Unfollowed");
  }

  /* ─────────────────────────────────────────
     COUNT HELPERS (for profile stats)
  ───────────────────────────────────────── */

  async function getFriendCount(uid) {
    if (!db) return 0;
    const snap = await db.collection("friendships")
      .where("users", "array-contains", uid).get();
    return snap.size;
  }

  async function getFollowerCount(uid) {
    if (!db) return 0;
    const snap = await db.collection("follows")
      .where("followingId", "==", uid).get();
    return snap.size;
  }

  async function getFollowingCount(uid) {
    if (!db) return 0;
    const snap = await db.collection("follows")
      .where("followerId", "==", uid).get();
    return snap.size;
  }

  async function getPendingRequestCount(uid) {
    if (!db) return 0;
    const snap = await db.collection("friendRequests")
      .where("to", "==", uid)
      .where("status", "==", "pending").get();
    return snap.size;
  }

  /* ─────────────────────────────────────────
     TOAST
  ───────────────────────────────────────── */

  function _toast(msg) {
    let t = document.getElementById("sh-friends-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "sh-friends-toast";
      t.style.cssText = `
        position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
        z-index:9999;padding:12px 22px;border-radius:12px;
        background:#1A1A2E;border:1px solid rgba(108,99,255,0.4);
        font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;
        color:#F0EFF8;box-shadow:0 20px 60px rgba(0,0,0,0.5);
        opacity:0;transition:all .3s;pointer-events:none;white-space:nowrap;
      `;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    t.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateX(-50%) translateY(20px)";
    }, 3000);
  }

  /* ─────────────────────────────────────────
     INJECT BUTTON STYLES
  ───────────────────────────────────────── */

  (function injectStyles() {
    const css = `
      .sh-friends-btn {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 10px 20px; border-radius: 12px;
        font-size: 13px; font-weight: 700; cursor: pointer;
        font-family: 'Plus Jakarta Sans', sans-serif;
        transition: all .2s; border: 1px solid transparent;
        white-space: nowrap;
      }
      .sh-friends-btn:disabled { opacity: .55; cursor: not-allowed; }

      /* Add Friend */
      .sh-friends-btn--add {
        background: linear-gradient(135deg, #6C63FF, #8B5CF6);
        color: #fff; border-color: transparent;
        box-shadow: 0 0 22px rgba(108,99,255,0.35);
      }
      .sh-friends-btn--add:hover { transform: translateY(-2px); box-shadow: 0 6px 30px rgba(108,99,255,0.5); }

      /* Request Sent */
      .sh-friends-btn--pending {
        background: rgba(251,191,36,0.1); color: #FBBF24;
        border-color: rgba(251,191,36,0.3);
      }
      .sh-friends-btn--pending:hover { background: rgba(251,191,36,0.18); }

      /* Accept */
      .sh-friends-btn--accept {
        background: rgba(52,211,153,0.12); color: #34D399;
        border-color: rgba(52,211,153,0.35);
      }
      .sh-friends-btn--accept:hover { background: rgba(52,211,153,0.22); }

      /* Friends */
      .sh-friends-btn--friends {
        background: rgba(52,211,153,0.1); color: #34D399;
        border-color: rgba(52,211,153,0.3);
      }
      .sh-friends-btn--friends:hover {
        background: rgba(248,113,113,0.1); color: #F87171;
        border-color: rgba(248,113,113,0.3);
      }
      .sh-friends-btn--friends:hover::after { content: ' · Unfriend'; }
      .sh-friends-btn--friends:hover svg { display: none; }

      /* Follow */
      .sh-friends-btn--follow {
        background: rgba(255,255,255,0.05); color: #A09DC0;
        border-color: rgba(255,255,255,0.12);
      }
      .sh-friends-btn--follow:hover { color: #F0EFF8; border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.08); }

      /* Following */
      .sh-friends-btn--following {
        background: rgba(108,99,255,0.12); color: #A78BFA;
        border-color: rgba(108,99,255,0.3);
      }
      .sh-friends-btn--following:hover {
        background: rgba(248,113,113,0.1); color: #F87171;
        border-color: rgba(248,113,113,0.3);
      }

      @keyframes shimmer {
        0%   { background-position: 200% 0 }
        100% { background-position: -200% 0 }
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  })();

  /* ─────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────── */
  return {
    init,
    renderButton,
    getFriendCount,
    getFollowerCount,
    getFollowingCount,
    getPendingRequestCount,
    // expose click handlers so inline onclick can call them
    _sendRequest,
    _cancelRequest,
    _acceptClick,
    _unfriendClick,
    _toggleFollowClick,
  };
})();