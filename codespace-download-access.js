/* ═══════════════════════════════════════════════════════════════
   codespace-download-access.js - FIXED
   Now: Once approved → direct download even after page reload
═══════════════════════════════════════════════════════════════ */

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_TRIES = 3;

/* ── Inject styles ── */
(function injectStyles() {
  const css = `...`; // (your existing styles - unchanged)
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

/* ── Build modal HTML ── */
(function buildModal() {
  // ... (your existing modal HTML - unchanged)
})();

/* ═══════════════════════════════════════════════════════════════
   SHDownloadAccess — Fixed Version
═══════════════════════════════════════════════════════════════ */
window.SHDownloadAccess = (() => {
  let _fileId = '', _fileName = '', _fileUrl = '';
  let _requestId = '';
  let _otpCode = '', _otpExpiry = 0, _otpTries = 0;
  let _timerInterval = null, _unsub = null;
  let _resendCooldown = false;

  const _containers = {}; // fileId → {container, fileName, fileUrl}

  const $ = id => document.getElementById(id);

  function showStep(n) {
    for (let i = 1; i <= 6; i++) {
      const el = $(`dlaStep${i}`);
      if (el) el.classList.toggle('active', i === n);
    }
  }

  function showErr(msg) {
    const el = $('dlaOtpErr');
    if (el) { el.textContent = msg; el.classList.add('show'); }
  }
  function clearErr() {
    const el = $('dlaOtpErr');
    if (el) el.classList.remove('show');
  }
  function clearOtpInputs() {
    document.querySelectorAll('.otp-digit').forEach(d => {
      d.value = '';
      d.classList.remove('filled', 'error');
    });
  }
  function getOtpValue() {
    return [...document.querySelectorAll('.otp-digit')].map(d => d.value).join('');
  }
  function shakeOtp() {
    document.querySelectorAll('.otp-digit').forEach(d => {
      d.classList.remove('error');
      void d.offsetWidth;
      d.classList.add('error');
    });
  }
  function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function startTimer() {
    clearInterval(_timerInterval);
    const end = _otpExpiry;
    _timerInterval = setInterval(() => {
      const remaining = Math.max(0, end - Date.now());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const el = $('dlaTimerVal');
      if (el) el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      if (remaining <= 0) {
        clearInterval(_timerInterval);
        showStep(6);
      }
    }, 1000);
  }

  function updateTriesUI() {
    const el = $('dlaTries');
    if (!el) return;
    const left = OTP_MAX_TRIES - _otpTries;
    el.textContent = left < OTP_MAX_TRIES ? `${left} attempt${left !== 1 ? 's' : ''} remaining` : '';
    el.className = 'dla-tries' + (left <= 1 ? ' warn' : '');
  }

  /* ── Check permanent approval (most important fix) ── */
  async function checkExistingApproval(fileId, userId) {
    try {
      const snap = await firebase.firestore()
        .collection('fileAccessGrants')
        .where('fileId', '==', fileId)
        .where('userId', '==', userId)
        .where('status', '==', 'approved')
        .limit(1)
        .get();

      return !snap.empty ? snap.docs[0].data() : null;
    } catch (e) {
      console.warn('[DLA] Approval check failed:', e);
      return null;
    }
  }

  async function checkPendingRequest(fileId, userId) {
    try {
      const snap = await firebase.firestore()
        .collection('downloadRequests')
        .where('fileId', '==', fileId)
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      return !snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
    } catch (e) {
      return null;
    }
  }

  /* ── Render button (now more reliable) ── */
  async function renderBtn(fileId, fileName, fileUrl, container) {
    if (!container) return;
    _containers[fileId] = { container, fileName, fileUrl };

    container.innerHTML = `<span style="font-size:12px;color:#484F58">Checking access…</span>`;

    const user = firebase.auth().currentUser;
    if (!user) {
      container.innerHTML = `
        <button class="dla-dl-btn" onclick="alert('Please sign in to download files.')">
          <i class="ti ti-download"></i> Download
        </button>`;
      return;
    }

    // 1. Check permanent approval first (this should always win)
    const grant = await checkExistingApproval(fileId, user.uid);
    if (grant) {
      renderApprovedBtn(container, fileId, fileName, fileUrl);
      return;
    }

    // 2. Check pending request
    const pending = await checkPendingRequest(fileId, user.uid);
    if (pending) {
      renderPendingBtn(container, pending.id, fileName, fileUrl);
      listenForDecision(pending.id, fileId, fileName, fileUrl, container);
      return;
    }

    // 3. No access → request button
    container.innerHTML = `
      <button class="dla-dl-btn" onclick="SHDownloadAccess.open('${fileId}','${fileName.replace(/'/g,"\\'")}','${fileUrl}')">
        <i class="ti ti-download"></i> Download
      </button>
      <div style="margin-top:8px;font-size:11px;color:#484F58">
        <i class="ti ti-shield-check" style="font-size:11px"></i> Email verification + admin approval required
      </div>`;
  }

  function renderApprovedBtn(container, fileId, fileName, fileUrl) {
    container.innerHTML = `
      <button class="dla-approved-btn" onclick="SHDownloadAccess._directDownload('${fileUrl}','${fileName.replace(/'/g,"\\'")}')">
        <i class="ti ti-download"></i> Download file
      </button>
      <div style="margin-top:8px;font-size:11px;color:#3FB950">
        <i class="ti ti-circle-check" style="font-size:11px"></i> Access approved — download anytime
      </div>`;
  }

  function renderPendingBtn(container, requestId, fileName, fileUrl) {
    container.innerHTML = `
      <div class="dla-pending-badge">
        <span class="pulse-dot"></span> Awaiting admin approval
      </div>
      <div style="margin-top:8px;font-size:11px;color:#484F58">
        Your request is in the queue.
      </div>`;
  }

  /* Listen for admin decision */
  function listenForDecision(requestId, fileId, fileName, fileUrl, container) {
    if (_unsub) { _unsub(); _unsub = null; }

    _unsub = firebase.firestore()
      .collection('downloadRequests')
      .doc(requestId)
      .onSnapshot(async snap => {
        if (!snap.exists) return;
        const data = snap.data();

        if (data.status === 'approved') {
          if (_unsub) { _unsub(); _unsub = null; }

          const user = firebase.auth().currentUser;
          if (user) {
            // Save permanent grant
            await firebase.firestore().collection('fileAccessGrants').add({
              fileId, fileName, fileUrl,
              userId: user.uid,
              userEmail: user.email,
              userName: user.displayName || user.email.split('@')[0],
              status: 'approved',
              grantedAt: firebase.firestore.FieldValue.serverTimestamp(),
              requestId,
            }).catch(() => {});

            snap.ref.update({
              status: 'completed',
              completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }).catch(() => {});
          }

          if ($('dlaBackdrop').classList.contains('show')) {
            showStep(4);
            triggerDownload(fileUrl, fileName);
          }

          if (container) renderApprovedBtn(container, fileId, fileName, fileUrl);

        } else if (data.status === 'rejected') {
          if (_unsub) { _unsub(); _unsub = null; }
          if ($('dlaBackdrop').classList.contains('show')) showStep(5);

          if (container) {
            container.innerHTML = `
              <button class="dla-dl-btn" onclick="SHDownloadAccess.open('${fileId}','${fileName.replace(/'/g,"\\'")}','${fileUrl}')">
                <i class="ti ti-download"></i> Request again
              </button>`;
          }
        }
      });
  }

  /* Send OTP */
  async function sendOtp(email, name, fileName) {
    _otpCode = generateOtp();
    _otpExpiry = Date.now() + OTP_EXPIRY_MS;
    _otpTries = 0;

    const res = await fetch('/api/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, fileName, otp: _otpCode }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }
  }

  /* Open flow */
  async function open(fileId, fileName, fileUrl) {
    const user = firebase.auth().currentUser;
    if (!user) {
      alert('Please sign in to download files.');
      return;
    }

    _fileId = fileId;
    _fileName = fileName;
    _fileUrl = fileUrl;

    // Double-check approval before showing modal
    const grant = await checkExistingApproval(fileId, user.uid);
    if (grant) {
      triggerDownload(fileUrl, fileName);
      return;
    }

    const pending = await checkPendingRequest(fileId, user.uid);
    if (pending) {
      _requestId = pending.id;
      $('dlaBackdrop').classList.add('show');
      $('dlaFileName').textContent = fileName;
      showStep(3);
      const container = _containers[fileId]?.container;
      listenForDecision(pending.id, fileId, fileName, fileUrl, container);
      return;
    }

    // Fresh request
    $('dlaBackdrop').classList.add('show');
    $('dlaFileName').textContent = fileName;
    $('dlaUserEmail').textContent = user.email;
    clearOtpInputs();
    clearErr();
    showStep(1);

    try {
      const name = user.displayName || user.email.split('@')[0];
      await sendOtp(user.email, name, fileName);
      startTimer();
      startResendCooldown();
      showStep(2);
      setTimeout(() => document.querySelector('.otp-digit')?.focus(), 100);
    } catch (e) {
      showStep(2);
      showErr('Could not send code. Try resending.');
    }
  }

  async function verifyOtp() { /* unchanged - already good */ 
    // ... (keep your existing verifyOtp logic)
  }

  async function resendOtp() { /* unchanged */ }

  function startResendCooldown() { /* unchanged */ }

  function triggerDownload(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 200);
  }

  function _triggerDownload() {
    triggerDownload(_fileUrl, _fileName);
  }

  function _directDownload(url, name) {
    triggerDownload(url, name);
  }

  function close() {
    $('dlaBackdrop').classList.remove('show');
    clearInterval(_timerInterval);

    if (_requestId) {
      firebase.firestore().collection('downloadRequests').doc(_requestId)
        .get().then(snap => {
          if (snap.exists && snap.data().status === 'pending') {
            snap.ref.update({ status: 'cancelled' }).catch(() => {});
          }
        });
      _requestId = '';
    }
  }

  return {
    open,
    close,
    verifyOtp,
    resendOtp,
    renderBtn,
    _triggerDownload,
    _directDownload
  };
})();