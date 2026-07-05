/* ═══════════════════════════════════════════════════════════════
   codespace-download-access.js
   FLOW:
     1. Check Firestore if user already has approval → show download
     2. Otherwise: Send OTP → Verify → Admin approves → Download
     3. Approval is stored in Firestore permanently per user+file
═══════════════════════════════════════════════════════════════ */
//codespace-download-access.js//
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_TRIES = 3;

/* ── Inject styles ── */
(function injectStyles() {
  const css = `
    #dlaBackdrop {
      display:none;position:fixed;inset:0;z-index:800;
      background:rgba(1,4,9,0.88);backdrop-filter:blur(6px);
      align-items:center;justify-content:center;
    }
    #dlaBackdrop.show { display:flex; }

    .dla-modal {
      background:#161B22;border:1px solid #30363D;border-radius:14px;
      padding:32px;width:100%;max-width:420px;position:relative;
      animation:dlaIn .2s ease;
    }
    @keyframes dlaIn {
      from{opacity:0;transform:translateY(10px) scale(.97)}
      to{opacity:1;transform:translateY(0) scale(1)}
    }
    .dla-modal-x {
      position:absolute;top:14px;right:14px;width:28px;height:28px;
      border-radius:6px;border:1px solid #30363D;background:transparent;
      color:#8B949E;font-size:14px;cursor:pointer;display:flex;
      align-items:center;justify-content:center;transition:all .12s;
    }
    .dla-modal-x:hover{border-color:#444C56;color:#E6EDF3;background:#21262D}

    .dla-step { display:none; }
    .dla-step.active { display:block; }

    .dla-icon {
      width:52px;height:52px;border-radius:12px;display:flex;
      align-items:center;justify-content:center;font-size:24px;
      margin:0 auto 18px;
    }
    .dla-icon.blue  { background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.2); }
    .dla-icon.gold  { background:rgba(210,153,34,0.12);border:1px solid rgba(210,153,34,0.2); }
    .dla-icon.green { background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.2); }
    .dla-icon.red   { background:rgba(248,81,73,0.12);border:1px solid rgba(248,81,73,0.2); }

    .dla-title {
      font-family:'Source Serif 4',serif;font-size:18px;font-weight:700;
      color:#E6EDF3;text-align:center;margin-bottom:7px;
    }
    .dla-sub {
      font-size:13px;color:#8B949E;text-align:center;line-height:1.65;
      margin-bottom:22px;
    }
    .dla-sub b { color:#E6EDF3; }

    .dla-send-ring, .dla-wait-ring {
      width:52px;height:52px;border-radius:50%;
      border:3px solid #30363D;
      animation:dlaRing 1s linear infinite;
      margin:0 auto 18px;
    }
    .dla-send-ring { border-top-color:#58A6FF; }
    .dla-wait-ring { border-top-color:#D29922; }
    @keyframes dlaRing { to{transform:rotate(360deg)} }

    .dla-status-pill {
      display:inline-flex;align-items:center;gap:7px;
      padding:6px 14px;border-radius:99px;font-size:12px;font-weight:600;
      margin-bottom:18px;
    }
    .dla-status-pill.waiting {
      background:rgba(210,153,34,0.1);border:1px solid rgba(210,153,34,0.25);color:#D29922;
    }
    .dla-status-pill .pulse-dot {
      width:6px;height:6px;border-radius:50%;background:#D29922;
      animation:dlaPulse 1.4s ease infinite;
    }
    @keyframes dlaPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}

    .otp-row {
      display:flex;gap:8px;justify-content:center;margin-bottom:18px;
    }
    .otp-digit {
      width:46px;height:54px;border-radius:8px;
      border:1.5px solid #30363D;background:#0D1117;
      color:#E6EDF3;font-size:22px;font-weight:700;
      text-align:center;outline:none;font-family:'JetBrains Mono',monospace;
      transition:border-color .15s;caret-color:transparent;
    }
    .otp-digit:focus { border-color:#58A6FF; }
    .otp-digit.filled { border-color:#444C56; }
    .otp-digit.error  { border-color:#F85149;animation:dlaShake .35s ease; }
    @keyframes dlaShake {
      0%,100%{transform:translateX(0)}
      20%{transform:translateX(-4px)}40%{transform:translateX(4px)}
      60%{transform:translateX(-3px)}80%{transform:translateX(3px)}
    }

    .dla-timer {
      font-size:12px;color:#484F58;text-align:center;margin-bottom:16px;
    }
    .dla-timer span { color:#8B949E;font-weight:600; }
    .dla-tries { font-size:12px;color:#8B949E;text-align:center;margin-bottom:14px; }
    .dla-tries.warn { color:#D29922; }

    .dla-btn {
      width:100%;padding:11px;border-radius:7px;border:none;
      font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;
      display:flex;align-items:center;justify-content:center;gap:7px;
      transition:all .15s;
    }
    .dla-btn.primary { background:#58A6FF;color:#0D1117; }
    .dla-btn.primary:hover { background:#79C0FF; }
    .dla-btn.primary:disabled { opacity:.45;cursor:not-allowed; }
    .dla-btn.ghost {
      background:transparent;color:#8B949E;
      border:1px solid #30363D;margin-top:10px;font-size:12.5px;font-weight:500;
    }
    .dla-btn.ghost:hover { color:#E6EDF3;border-color:#444C56;background:#21262D; }
    .dla-btn.green-btn { background:#3FB950;color:#0D1117; }
    .dla-btn.green-btn:hover { background:#57d46c; }

    .dla-err {
      padding:9px 12px;border-radius:6px;
      background:rgba(248,81,73,0.09);border:1px solid rgba(248,81,73,0.22);
      color:#F85149;font-size:12.5px;text-align:center;
      margin-bottom:14px;display:none;
    }
    .dla-err.show { display:block; }

    .dla-resend {
      font-size:12px;color:#484F58;text-align:center;margin-top:12px;
    }
    .dla-resend a { color:#58A6FF;cursor:pointer;text-decoration:none; }
    .dla-resend a:hover { text-decoration:underline; }
    .dla-resend a.disabled { color:#484F58;pointer-events:none; }

    /* Download button states */
    .dla-dl-btn {
      display:inline-flex;align-items:center;gap:7px;
      padding:9px 22px;border-radius:7px;
      background:#58A6FF;color:#0D1117;border:none;
      font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
      transition:all .15s;
    }
    .dla-dl-btn:hover { background:#79C0FF; }

    .dla-approved-btn {
      display:inline-flex;align-items:center;gap:7px;
      padding:9px 22px;border-radius:7px;
      background:#3FB950;color:#0D1117;border:none;
      font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
      transition:all .15s;
    }
    .dla-approved-btn:hover { background:#57d46c; }

    .dla-pending-badge {
      display:inline-flex;align-items:center;gap:7px;
      padding:8px 16px;border-radius:7px;
      background:rgba(210,153,34,0.1);border:1px solid rgba(210,153,34,0.25);
      color:#D29922;font-size:13px;font-weight:600;
    }
    .dla-pending-badge .pulse-dot {
      width:6px;height:6px;border-radius:50%;background:#D29922;
      animation:dlaPulse 1.4s ease infinite;
    }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

/* ── Build modal HTML ── */
(function buildModal() {
  const div = document.createElement('div');
  div.id = 'dlaBackdrop';
  div.innerHTML = `
    <div class="dla-modal">
      <button class="dla-modal-x" onclick="SHDownloadAccess.close()">
        <i class="ti ti-x"></i>
      </button>

      <!-- STEP 1: Sending OTP spinner -->
      <div class="dla-step" id="dlaStep1">
        <div style="text-align:center">
          <div class="dla-send-ring"></div>
          <div class="dla-title">Sending verification code…</div>
          <p class="dla-sub">We're sending a 6-digit code to your email.</p>
        </div>
      </div>

      <!-- STEP 2: OTP entry -->
      <div class="dla-step" id="dlaStep2">
        <div class="dla-icon blue">
          <i class="ti ti-mail" style="font-size:22px;color:#58A6FF"></i>
        </div>
        <div class="dla-title">Enter verification code</div>
        <p class="dla-sub">
          We sent a 6-digit code to <b id="dlaUserEmail"></b>.<br/>
          Enter it below to submit your download request.
        </p>
        <div class="dla-err" id="dlaOtpErr"></div>
        <div class="otp-row" id="otpRow">
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]"/>
        </div>
        <div class="dla-timer">Code expires in <span id="dlaTimerVal">5:00</span></div>
        <div class="dla-tries" id="dlaTries"></div>
        <button class="dla-btn primary" id="dlaVerifyBtn" onclick="SHDownloadAccess.verifyOtp()">
          <i class="ti ti-shield-check"></i> Verify & Submit Request
        </button>
        <div class="dla-resend">
          Didn't get it? <a id="dlaResendLink" onclick="SHDownloadAccess.resendOtp()">Resend code</a>
        </div>
        <button class="dla-btn ghost" onclick="SHDownloadAccess.close()">Cancel</button>
      </div>

      <!-- STEP 3: Waiting for admin -->
      <div class="dla-step" id="dlaStep3">
        <div style="text-align:center">
          <div class="dla-wait-ring"></div>
          <div class="dla-title">Waiting for Admin Approval</div>
          <p class="dla-sub">
            Your identity is verified ✓<br/>
            Your request for <b id="dlaFileName"></b> has been sent to the admin.
          </p>
          <div class="dla-status-pill waiting">
            <span class="pulse-dot"></span> Pending approval…
          </div>
          <p style="font-size:12px;color:#484F58;line-height:1.65">
            Keep this window open. You'll be notified automatically when approved.
          </p>
        </div>
        <button class="dla-btn ghost" onclick="SHDownloadAccess.close()" style="margin-top:20px">
          Cancel request
        </button>
      </div>

      <!-- STEP 4: Approved — download now -->
      <div class="dla-step" id="dlaStep4">
        <div class="dla-icon green">
          <i class="ti ti-circle-check" style="font-size:24px;color:#3FB950"></i>
        </div>
        <div class="dla-title">Request Approved!</div>
        <p class="dla-sub">
          The admin approved your request for <b id="dlaSuccessFile"></b>.<br/>
          Your download will start automatically. You can also download it anytime from the file page.
        </p>
        <button class="dla-btn green-btn" id="dlaManualDlBtn" onclick="SHDownloadAccess._triggerDownload()">
          <i class="ti ti-download"></i> Download now
        </button>
        <button class="dla-btn ghost" onclick="SHDownloadAccess.close()">Close</button>
      </div>

      <!-- STEP 5: Rejected -->
      <div class="dla-step" id="dlaStep5">
        <div class="dla-icon red">
          <i class="ti ti-shield-x" style="font-size:24px;color:#F85149"></i>
        </div>
        <div class="dla-title">Request Rejected</div>
        <p class="dla-sub">The admin declined this download request.<br/>Contact them if you think this was a mistake.</p>
        <button class="dla-btn ghost" onclick="SHDownloadAccess.close()">Close</button>
      </div>

      <!-- STEP 6: OTP expired -->
      <div class="dla-step" id="dlaStep6">
        <div class="dla-icon gold">
          <i class="ti ti-clock-x" style="font-size:24px;color:#D29922"></i>
        </div>
        <div class="dla-title">Code Expired</div>
        <p class="dla-sub">Your OTP has expired. Please start over.</p>
        <button class="dla-btn primary" onclick="SHDownloadAccess.close()">Close</button>
      </div>
    </div>`;

  document.body.appendChild(div);

  /* OTP digit navigation */
  const digits = div.querySelectorAll('.otp-digit');
  digits.forEach((inp, i) => {
    inp.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      e.target.classList.toggle('filled', !!val);
      if (val && i < digits.length - 1) digits[i + 1].focus();
      if (i === digits.length - 1 && val) SHDownloadAccess.verifyOtp();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) digits[i - 1].focus();
    });
    inp.addEventListener('paste', e => {
      e.preventDefault();
      const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      digits.forEach((d, idx) => { d.value = pasted[idx] || ''; d.classList.toggle('filled', !!d.value); });
      if (pasted.length === 6) SHDownloadAccess.verifyOtp();
    });
  });
})();

/* ═══════════════════════════════════════════════════════════════
   SHDownloadAccess — public API
═══════════════════════════════════════════════════════════════ */
window.SHDownloadAccess = (() => {
  let _fileId = '', _fileName = '', _fileUrl = '';
  let _requestId = '';
  let _otpCode = '', _otpExpiry = 0, _otpTries = 0;
  let _timerInterval = null, _unsub = null;
  let _resendCooldown = false;
  /* Map of containers so we can update them when approval arrives */
  const _containers = {};

  const $ = id => document.getElementById(id);

  function showStep(n) {
    for (let i = 1; i <= 6; i++) {
      const el = $(`dlaStep${i}`);
      if (el) el.classList.toggle('active', i === n);
    }
  }
  function showErr(msg) { const el = $('dlaOtpErr'); if(el){el.textContent=msg;el.classList.add('show');} }
  function clearErr()   { const el = $('dlaOtpErr'); if(el) el.classList.remove('show'); }
  function clearOtpInputs() {
    document.querySelectorAll('.otp-digit').forEach(d => { d.value=''; d.classList.remove('filled','error'); });
  }
  function getOtpValue() {
    return [...document.querySelectorAll('.otp-digit')].map(d => d.value).join('');
  }
  function shakeOtp() {
    document.querySelectorAll('.otp-digit').forEach(d => {
      d.classList.remove('error'); void d.offsetWidth; d.classList.add('error');
    });
  }
  function generateOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }

  function startTimer() {
    clearInterval(_timerInterval);
    const end = _otpExpiry;
    _timerInterval = setInterval(() => {
      const remaining = Math.max(0, end - Date.now());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const el = $('dlaTimerVal');
      if (el) el.textContent = `${mins}:${secs.toString().padStart(2,'0')}`;
      if (remaining === 0) { clearInterval(_timerInterval); showStep(6); }
    }, 1000);
  }

  function updateTriesUI() {
    const el = $('dlaTries'); if (!el) return;
    const left = OTP_MAX_TRIES - _otpTries;
    el.textContent = left < OTP_MAX_TRIES ? `${left} attempt${left!==1?'s':''} remaining` : '';
    el.className = 'dla-tries' + (left <= 1 ? ' warn' : '');
  }

  /* ── Check Firestore if user already has permanent approval ── */
async function checkExistingApproval(fileId, userId) {
  try {
    const snap = await firebase.firestore()
      .collection('downloadRequests')
      .where('fileId', '==', fileId)
      .where('userId', '==', userId)
      .get();
    if (snap.empty) return null;
    const approved = snap.docs.find(d =>
      ['approved', 'completed'].includes(d.data().status)
    );
    return approved ? { id: approved.id, ...approved.data() } : null;
  } catch (e) {
    console.error('[DLA] checkExistingApproval error:', e);
    return null;
  }
}

  /* ── Check if there's already a pending request ── */
  async function checkPendingRequest(fileId, userId) {
  try {
    const snap = await firebase.firestore()
      .collection('downloadRequests')
      .where('fileId', '==', fileId)
      .where('userId', '==', userId)
      .get();
    if (snap.empty) return null;
    const pending = snap.docs.find(d => d.data().status === 'pending');
    return pending ? { id: pending.id, ...pending.data() } : null;
  } catch (e) {
    console.error('[DLA] checkPendingRequest error:', e);
    return null;
  }
}

  /* ── Render button — checks approval status first ── */
async function renderBtn(fileId, fileName, fileUrl, container) {
  if (!container) return;
  _containers[fileId] = { container, fileName, fileUrl };
  container.innerHTML = `<span style="font-size:12px;color:#484F58">Checking access…</span>`;

  // Wait for Firebase auth to actually resolve (fixes page-reload issue)
  const user = await new Promise(resolve => {
    const unsub = firebase.auth().onAuthStateChanged(u => { unsub(); resolve(u); });
  });

  if (!user) {
    container.innerHTML = `
      <button class="dla-dl-btn" onclick="alert('Please sign in to download files.')">
        <i class="ti ti-download"></i> Download
      </button>`;
    return;
  }

  // Check permanent approval first
  const grant = await checkExistingApproval(fileId, user.uid);
  if (grant) {
    renderApprovedBtn(container, fileId, fileName, fileUrl);
    return;
  }

  // Check pending request
  const pending = await checkPendingRequest(fileId, user.uid);
  if (pending) {
    renderPendingBtn(container, pending.id, fileName, fileUrl);
    listenForDecision(pending.id, fileId, fileName, fileUrl, container);
    return;
  }

  // No access — show request button
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
        Your request is in the queue. Refresh to check status.
      </div>`;
  }

  /* ── Listen for admin decision on a request ── */
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

          /* Save permanent approval to Firestore */
          const user = firebase.auth().currentUser;
          if (user) {
            // await firebase.firestore().collection('fileAccessGrants').add({
            //   fileId, fileName, fileUrl,
            //   userId    : user.uid,
            //   userEmail : user.email,
            //   userName  : user.displayName || user.email.split('@')[0],
            //   status    : 'approved',
            //   grantedAt : firebase.firestore.FieldValue.serverTimestamp(),
            //   requestId,
            // }).catch(() => {});

            /* Mark request as completed */
            snap.ref.update({
              status: 'completed',
              completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }).catch(() => {});
          }

          /* Update UI in modal */
          if ($('dlaBackdrop').classList.contains('show')) {
            showStep(4);
            triggerDownload(fileUrl, fileName);
          }

          /* Update button on the file card */
          if (container) renderApprovedBtn(container, fileId, fileName, fileUrl);

        } else if (data.status === 'rejected') {
          if (_unsub) { _unsub(); _unsub = null; }
          if ($('dlaBackdrop').classList.contains('show')) showStep(5);
          if (container) {
            container.innerHTML = `
              <button class="dla-dl-btn" onclick="SHDownloadAccess.open('${fileId}','${fileName.replace(/'/g,"\\'")}','${fileUrl}')">
                <i class="ti ti-download"></i> Request again
              </button>
              <div style="margin-top:8px;font-size:11px;color:#F85149">
                <i class="ti ti-x" style="font-size:11px"></i> Previous request was rejected
              </div>`;
          }
        }
      });
  }

  /* ── Send OTP via serverless function ── */
  async function sendOtp(email, name, fileName) {
    _otpCode   = generateOtp();
    _otpExpiry = Date.now() + OTP_EXPIRY_MS;
    _otpTries  = 0;

    const res = await fetch('/api/send-otp', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ email, name, fileName, otp: _otpCode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }
  }

  /* ── Public: open the flow ── */
  async function open(fileId, fileName, fileUrl) {
  // Wait for auth to resolve
  const user = await new Promise(resolve => {
    const unsub = firebase.auth().onAuthStateChanged(u => { unsub(); resolve(u); });
  });

  if (!user) { alert('Please sign in to download files.'); return; }

  _fileId    = fileId;
  _fileName  = fileName;
  _fileUrl   = fileUrl;
  _requestId = '';

  // Already permanently approved — just download directly
  const grant = await checkExistingApproval(fileId, user.uid);
  if (grant) {
    triggerDownload(fileUrl, fileName);
    return;
  }

  // Already has a pending request — show waiting screen
  const pending = await checkPendingRequest(fileId, user.uid);
  if (pending) {
    _requestId = pending.id;
    $('dlaBackdrop').classList.add('show');
    $('dlaFileName').textContent    = fileName;
    $('dlaSuccessFile').textContent = fileName;
    showStep(3);
    const container = _containers[fileId] ? _containers[fileId].container : null;
    listenForDecision(pending.id, fileId, fileName, fileUrl, container);
    return;
  }

  // Fresh flow — send OTP
  $('dlaBackdrop').classList.add('show');
  $('dlaFileName').textContent    = fileName;
  $('dlaUserEmail').textContent   = user.email;
  $('dlaSuccessFile').textContent = fileName;
  clearOtpInputs(); clearErr();
  showStep(1);

  try {
    const name = user.displayName || user.email.split('@')[0];
    await sendOtp(user.email, name, fileName);
    startTimer();
    startResendCooldown();
    showStep(2);
    setTimeout(() => { const f = document.querySelector('.otp-digit'); if (f) f.focus(); }, 100);
  } catch (e) {
    showStep(2);
    showErr('Could not send code: ' + e.message + '. Try resending.');
  }
}

  /* ── Public: verify OTP ── */
  async function verifyOtp() {
    const entered = getOtpValue();
    if (entered.length < 6) { showErr('Enter all 6 digits.'); return; }
    if (Date.now() > _otpExpiry) { showStep(6); return; }
    clearErr();
    _otpTries++;

    if (entered !== _otpCode) {
      shakeOtp(); clearOtpInputs();
      setTimeout(() => { const f = document.querySelector('.otp-digit'); if(f) f.focus(); }, 50);
      if (_otpTries >= OTP_MAX_TRIES) {
        clearInterval(_timerInterval);
        showErr('Too many wrong attempts.');
        setTimeout(() => showStep(6), 1500);
      } else {
        showErr(`Incorrect code. ${OTP_MAX_TRIES - _otpTries} attempt${OTP_MAX_TRIES - _otpTries !== 1 ? 's' : ''} remaining.`);
        updateTriesUI();
      }
      return;
    }

    /* OTP correct — create download request */
    clearInterval(_timerInterval);
    showStep(3);

    const user = firebase.auth().currentUser;
    try {
      const ref = await firebase.firestore().collection('downloadRequests').add({
        fileId      : _fileId,
        fileName    : _fileName,
        fileUrl     : _fileUrl,
        userId      : user.uid,
        userEmail   : user.email,
        userName    : user.displayName || user.email.split('@')[0],
        status      : 'pending',
        otpVerified : true,
        requestedAt : firebase.firestore.FieldValue.serverTimestamp(),
      });
      _requestId = ref.id;

      /* Listen for decision */
      const container = _containers[_fileId] ? _containers[_fileId].container : null;
      if (container) renderPendingBtn(container, ref.id, _fileName, _fileUrl);
      listenForDecision(ref.id, _fileId, _fileName, _fileUrl, container);

    } catch (e) {
      console.warn('[DLA] Firestore write failed:', e.message);
    }
  }

  /* ── Public: resend OTP ── */
  async function resendOtp() {
    if (_resendCooldown) return;
    clearErr(); clearOtpInputs();
    const user = firebase.auth().currentUser;
    try {
      const name = user.displayName || user.email.split('@')[0];
      await sendOtp(user.email, name, _fileName);
      startTimer();
      startResendCooldown();
      _otpTries = 0; updateTriesUI();
    } catch (e) {
      showErr('Could not resend: ' + e.message);
    }
  }

  function startResendCooldown() {
    _resendCooldown = true;
    const link = $('dlaResendLink'); if (!link) return;
    let secs = 30;
    link.classList.add('disabled');
    link.textContent = `Resend in ${secs}s`;
    const iv = setInterval(() => {
      secs--;
      if (link) link.textContent = `Resend in ${secs}s`;
      if (secs <= 0) {
        clearInterval(iv); _resendCooldown = false;
        if (link) { link.classList.remove('disabled'); link.textContent = 'Resend code'; }
      }
    }, 1000);
  }

  /* ── Download triggers ── */
  function triggerDownload(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.target = '_blank';
    document.body.appendChild(a); a.click();
    setTimeout(() => document.body.removeChild(a), 200);
  }

  /* Called from manual download button inside modal */
  function _triggerDownload() {
    triggerDownload(_fileUrl, _fileName);
  }

  /* Called from approved button on file card */
  function _directDownload(url, name) {
    triggerDownload(url, name);
  }

/* ── Public: close modal ── */
  function close() {
    $('dlaBackdrop').classList.remove('show');
    clearInterval(_timerInterval);
    /* NOTE: we intentionally do NOT cancel the pending request here.
       Closing the modal should only hide the UI — the request must
       stay 'pending' in Firestore so the admin still sees it in
       their notifications panel. The user can reopen the modal
       later (it will detect the existing pending request and jump
       straight back to the "waiting for approval" screen). */
    _requestId = '';
    /* Don't kill _unsub here — keep listening if approved request exists */
  }

  return { open, close, verifyOtp, resendOtp, renderBtn, _triggerDownload, _directDownload };
})();