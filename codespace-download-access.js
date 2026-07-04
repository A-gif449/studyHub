//codespace-download-access//
window.SHDownloadAccess = (function () {
  "use strict";

  const db   = () => firebase.firestore();
  const auth = () => firebase.auth().currentUser;
  const ADMIN = window.ADMIN_EMAILS || [];

  /* ── Check if current user has access to a file ── */
  async function hasAccess(fileId) {
    const user = auth();
    if (!user) return false;
    if (ADMIN.includes(user.email)) return true;
    try {
      const snap = await db().collection("downloadAccess")
        .doc(user.uid + "_" + fileId).get();
      return snap.exists;
    } catch (e) { return false; }
  }

  /* ── Check pending request status ── */
  async function getRequestStatus(fileId) {
    const user = auth();
    if (!user) return null;
    try {
      const snap = await db().collection("downloadRequests")
        .where("uid", "==", user.uid)
        .where("fileId", "==", fileId)
        .orderBy("requestedAt", "desc")
        .limit(1).get();
      if (snap.empty) return null;
      return snap.docs[0].data().status; // "pending" | "approved" | "rejected"
    } catch (e) { return null; }
  }

  /* ── Send a download request ── */
  async function requestAccess(fileId, fileName) {
    const user = auth();
    if (!user) { showMsg("Sign in to request access.", "error"); return; }
    try {
      // check no duplicate pending
      const existing = await db().collection("downloadRequests")
        .where("uid", "==", user.uid)
        .where("fileId", "==", fileId)
        .where("status", "==", "pending").get();
      if (!existing.empty) {
        showMsg("Request already sent. Wait for admin approval.", "info"); return;
      }
      await db().collection("downloadRequests").add({
        uid:       user.uid,
        userEmail: user.email,
        userName:  user.displayName || user.email,
        fileId,
        fileName,
        status:    "pending",
        requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      showMsg("Access requested! Admin will review shortly.", "success");
      // refresh the button
      renderDownloadBtn(fileId, fileName);
    } catch (e) { showMsg("Error: " + e.message, "error"); }
  }

  /* ── Approve a request (admin only) ── */
  window._shApproveDownload = async function (reqId, uid, fileId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Approving…"; }
    try {
      const batch = db().batch();
      // update request status
      batch.update(db().collection("downloadRequests").doc(reqId), {
        status: "approved",
        resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        resolvedBy: firebase.auth().currentUser?.email,
      });
      // create access doc
      batch.set(db().collection("downloadAccess").doc(uid + "_" + fileId), {
        uid, fileId,
        grantedAt: firebase.firestore.FieldValue.serverTimestamp(),
        grantedBy: firebase.auth().currentUser?.email,
      });
      await batch.commit();
      showMsg("Access granted!", "success");
    } catch (e) { showMsg("Error: " + e.message, "error"); }
  };

  /* ── Reject a request (admin only) ── */
  window._shRejectDownload = async function (reqId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Rejecting…"; }
    try {
      await db().collection("downloadRequests").doc(reqId).update({
        status: "rejected",
        resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        resolvedBy: firebase.auth().currentUser?.email,
      });
      showMsg("Request rejected.", "success");
    } catch (e) { showMsg("Error: " + e.message, "error"); }
  };

  /* ── Render the correct download button for a file ── */
  async function renderDownloadBtn(fileId, fileName, fileUrl, containerEl) {
    const user = auth();
    if (!containerEl) return;

    // Admin always gets direct download
    if (user && ADMIN.includes(user.email)) {
      containerEl.innerHTML = dlBtn(fileUrl, fileName);
      return;
    }

    // Not logged in
    if (!user) {
      containerEl.innerHTML = `<a href="index.html?login=1"
        style="${btnStyle("var(--border2)","var(--text2)")}">
        <i class="ti ti-lock"></i> Sign in to Download
      </a>`;
      return;
    }

   // Check access
    const access = await hasAccess(fileId);
    if (access) {
      containerEl.innerHTML = dlBtn(fileUrl, fileName);
      return;
    }

    // Watch for access being granted in real time
    watchDownloadAccess(fileId, fileName, fileUrl, containerEl);

    // Check request status
    const status = await getRequestStatus(fileId);
    if (status === "pending") {
      containerEl.innerHTML = `<button disabled
        style="${btnStyle("rgba(201,163,86,0.2)","#C9A356","rgba(201,163,86,0.3)")}">
        <i class="ti ti-clock"></i> Request Pending…
      </button>`;
      return;
    }
    if (status === "rejected") {
      containerEl.innerHTML = `<button
        onclick="SHDownloadAccess.request('${fileId}','${esc(fileName)}')"
        style="${btnStyle("rgba(194,86,79,0.12)","#C2564F","rgba(194,86,79,0.25)")}">
        <i class="ti ti-x"></i> Rejected — Request Again
      </button>`;
      return;
    }

    // No request yet
    containerEl.innerHTML = `<button
      onclick="SHDownloadAccess.request('${fileId}','${esc(fileName)}')"
      style="${btnStyle("rgba(91,127,255,0.12)","#8FA3D6","rgba(91,127,255,0.25)")}">
      <i class="ti ti-download"></i> Request Download Access
    </button>`;
  }

  function dlBtn(url, name) {
    return `<a href="${url}" target="_blank" download="${esc(name)}"
      style="${btnStyle("var(--green)","#0D1117","var(--green)")} font-weight:700">
      <i class="ti ti-download"></i> Download
    </a>`;
  }

  function btnStyle(bg, color, border) {
    border = border || bg;
    return `display:inline-flex;align-items:center;gap:7px;padding:9px 22px;
      border-radius:6px;background:${bg};color:${color};border:1px solid ${border};
      font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;
      text-decoration:none;transition:all .15s;`;
  }

  function esc(s) {
    return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  /* ── Toast ── */
  function showMsg(msg, type) {
    // reuse existing toast if present
    const t = document.getElementById("toast");
    if (t) {
      document.getElementById("toastMsg").textContent = msg;
      document.getElementById("toastIcon").className =
        type === "success" ? "ti ti-check" :
        type === "error"   ? "ti ti-alert-circle" : "ti ti-info-circle";
      t.className = `toast ${type === "success" ? "success" : type === "error" ? "error" : ""} show`;
      clearTimeout(t._t);
      t._t = setTimeout(() => t.classList.remove("show"), 3500);
    }
  }

  // Auto-refresh download buttons when access is granted
  function watchDownloadAccess(fileId, fileName, fileUrl, containerEl) {
    const user = auth();
    if (!user) return;
    firebase.firestore()
      .collection('downloadAccess')
      .doc(user.uid + '_' + fileId)
      .onSnapshot(snap => {
        if (snap.exists) {
          containerEl.innerHTML = dlBtn(fileUrl, fileName);
        }
      });
  }

  return {
    hasAccess,
    getRequestStatus,
    request: requestAccess,
    renderBtn: renderDownloadBtn,
  };
})();