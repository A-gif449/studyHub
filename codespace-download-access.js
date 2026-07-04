/* ═══════════════════════════════════════════════════════════════
   codespace-download-access.js
   2-Factor Download Auth:
     Step 1 — Admin approves the request in real-time
     Step 2 — OTP sent to user's email via Resend, user verifies
   ═══════════════════════════════════════════════════════════════ */

const RESEND_API_KEY = 're_JVRhAjDV_APaYhYXttj9ULoSpnS7my4Rk';
const OTP_FROM       = 'onboarding@resend.dev';
const OTP_EXPIRY_MS  = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_TRIES  = 3;

/* ── Inject styles ── */
(function injectStyles() {
  const css = `
    /* ── Download access modal ── */
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

    /* Step icons */
    .dla-icon {
      width:52px;height:52px;border-radius:12px;display:flex;
      align-items:center;justify-content:center;font-size:24px;
      margin:0 auto 18px;
    }
    .dla-icon.wait  { background:rgba(210,153,34,0.12);border:1px solid rgba(210,153,34,0.2); }
    .dla-icon.otp   { background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.2); }
    .dla-icon.ok    { background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.2); }
    .dla-icon.deny  { background:rgba(248,81,73,0.12);border:1px solid rgba(248,81,73,0.2); }

    .dla-title {
      font-family:'Source Serif 4',serif;font-size:18px;font-weight:700;
      color:#E6EDF3;text-align:center;margin-bottom:7px;
    }
    .dla-sub {
      font-size:13px;color:#8B949E;text-align:center;line-height:1.65;
      margin-bottom:22px;
    }
    .dla-sub b { color:#E6EDF3; }

    /* Waiting animation */
    .dla-wait-ring {
      width:56px;height:56px;border-radius:50%;
      border:3px solid #30363D;border-top-color:#D29922;
      animation:dlaRing 1s linear infinite;
      margin:0 auto 18px;
    }
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

    /* OTP input */
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
      20%{transform:translateX(-4px)}
      40%{transform:translateX(4px)}
      60%{transform:translateX(-3px)}
      80%{transform:translateX(3px)}
    }

    .dla-timer {
      font-size:12px;color:#484F58;text-align:center;margin-bottom:16px;
    }
    .dla-timer span { color:#8B949E;font-weight:600; }

    .dla-tries {
      font-size:12px;color:#8B949E;text-align:center;margin-bottom:14px;
    }
    .dla-tries.warn { color:#D29922; }

    .dla-btn {
      width:100%;padding:11px;border-radius:7px;border:none;
      font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;
      display:flex;align-items:center;justify-content:center;gap:7px;
      transition:all .15s;
    }
    .dla-btn.primary {
      background:#58A6FF;color:#0D1117;
    }
    .dla-btn.primary:hover { background:#79C0FF; }
    .dla-btn.primary:disabled { opacity:.45;cursor:not-allowed; }
    .dla-btn.ghost {
      background:transparent;color:#8B949E;
      border:1px solid #30363D;margin-top:10px;
    }
    .dla-btn.ghost:hover { color:#E6EDF3;border-color:#444C56;background:#21262D; }

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
    .dla-resend a {
      color:#58A6FF;cursor:pointer;text-decoration:none;
    }
    .dla-resend a:hover { text-decoration:underline; }
    .dla-resend a.disabled { color:#484F58;pointer-events:none; }

    /* Download trigger button */
    .dla-dl-btn {
      display:inline-flex;align-items:center;gap:7px;
      padding:9px 20px;border-radius:7px;
      background:#58A6FF;color:#0D1117;border:none;
      font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
      transition:all .15s;
    }
    .dla-dl-btn:hover { background:#79C0FF; }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

/* ── Build modal HTML once ── */
(function buildModal() {
  const div = document.createElement('div');
  div.id = 'dlaBackdrop';
  div.innerHTML = `
    <div class="dla-modal">
      <button class="dla-modal-x" onclick="SHDownloadAccess.close()"><i class="ti ti-x"></i></button>

      <!-- STEP 1: Request sent, waiting for admin -->
      <div class="dla-step" id="dlaStep1">
        <div style="text-align:center">
          <div class="dla-wait-ring"></div>
          <div class="dla-title">Waiting for Admin Approval</div>
          <p class="dla-sub">Your download request for <b id="dlaFileName"></b> has been sent to the admin. This usually takes a moment.</p>
          <div class="dla-status-pill waiting">
            <span class="pulse-dot"></span> Pending approval…
          </div>
          <p style="font-size:12px;color:#484F58;line-height:1.65">Keep this window open. You'll be moved to the next step automatically once approved.</p>
        </div>
        <button class="dla-btn ghost" onclick="SHDownloadAccess.close()" style="margin-top:20px">Cancel request</button>
      </div>

      <!-- STEP 2: OTP verification -->
      <div class="dla-step" id="dlaStep2">
        <div class="dla-icon otp"><i class="ti ti-mail" style="font-size:22px;color:#58A6FF"></i></div>
        <div class="dla-title">Check your email</div>
        <p class="dla-sub">We sent a 6-digit code to <b id="dlaUserEmail"></b>. Enter it below to verify and download.</p>
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
          <i class="ti ti-shield-check"></i> Verify & Download
        </button>
        <div class="dla-resend">
          Didn't get it? <a id="dlaResendLink" onclick="SHDownloadAccess.resendOtp()">Resend code</a>
        </div>
      </div>

      <!-- STEP 3: Success -->
      <div class="dla-step" id="dlaStep3">
        <div class="dla-icon ok"><i class="ti ti-circle-check" style="font-size:24px;color:#3FB950"></i></div>
        <div class="dla-title">Download started!</div>
        <p class="dla-sub">Your file <b id="dlaSuccessFile"></b> is downloading. Enjoy!</p>
        <button class="dla-btn primary" onclick="SHDownloadAccess.close()">Done</button>
      </div>

      <!-- STEP 4: Rejected -->
      <div class="dla-step" id="dlaStep4">
        <div class="dla-icon deny"><i class="ti ti-shield-x" style="font-size:24px;color:#F85149"></i></div>
        <div class="dla-title">Request Rejected</div>
        <p class="dla-sub">The admin declined this download request. Contact them if you think this was a mistake.</p>
        <button class="dla-btn ghost" onclick="SHDownloadAccess.close()">Close</button>
      </div>

      <!-- STEP 5: OTP expired -->
      <div class="dla-step" id="dlaStep5">
        <div class="dla-icon wait"><i class="ti ti-clock-x" style="font-size:24px;color:#D29922"></i></div>
        <div class="dla-title">Code Expired</div>
        <p class="dla-sub">Your OTP has expired. Please start over to request a new one.</p>
        <button class="dla-btn primary" onclick="SHDownloadAccess.close()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(div);

  // OTP input auto-advance
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

  /* ── helpers ── */
  const $ = id => document.getElementById(id);
  function showStep(n) {
    for (let i = 1; i <= 5; i++) {
      const el = $(`dlaStep${i}`);
      if (el) el.classList.toggle('active', i === n);
    }
  }
  function showErr(msg) {
    const el = $('dlaOtpErr');
    el.textContent = msg; el.classList.add('show');
  }
  function clearErr() { $('dlaOtpErr').classList.remove('show'); }
  function clearOtpInputs() {
    document.querySelectorAll('.otp-digit').forEach(d => {
      d.value = ''; d.classList.remove('filled', 'error');
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
      if (remaining === 0) {
        clearInterval(_timerInterval);
        showStep(5);
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

  /* ── Send OTP via Resend ── */
  async function sendOtp(email, name, fileName) {
    _otpCode   = generateOtp();
    _otpExpiry = Date.now() + OTP_EXPIRY_MS;
    _otpTries  = 0;

    const html = `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0D1117;color:#E6EDF3;border-radius:12px;overflow:hidden;border:1px solid #30363D">
        <div style="padding:24px 28px;background:#161B22;border-bottom:1px solid #30363D">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:8px;background:#21262D;border:1px solid #30363D;display:flex;align-items:center;justify-content:center;font-size:15px">⚛️</div>
            <span style="font-family:serif;font-size:16px;font-weight:700;color:#E6EDF3">StudyHub</span>
          </div>
        </div>
        <div style="padding:28px">
          <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;color:#E6EDF3">Your download code</h2>
          <p style="font-size:13.5px;color:#8B949E;margin:0 0 24px;line-height:1.6">
            Hi <strong style="color:#E6EDF3">${name}</strong>, your admin-approved download of <strong style="color:#58A6FF">${fileName}</strong> is ready. Use this code to verify:
          </p>
          <div style="background:#0D1117;border:1px solid #30363D;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
            <div style="font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:#58A6FF">${_otpCode}</div>
            <div style="font-size:12px;color:#484F58;margin-top:8px">Expires in 5 minutes · Do not share</div>
          </div>
          <p style="font-size:12px;color:#484F58;line-height:1.65;margin:0">
            If you didn't request this, ignore this email. This code will expire automatically.
          </p>
        </div>
        <div style="padding:16px 28px;background:#161B22;border-top:1px solid #30363D;font-size:11.5px;color:#484F58;text-align:center">
          StudyHub · Secure download verification
        </div>
      </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: OTP_FROM,
        to: [email],
        subject: `${_otpCode} is your StudyHub download code`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Resend error ${res.status}`);
    }
  }

  /* ── Public: render download button into a container element ── */
  function renderBtn(fileId, fileName, fileUrl, container) {
    if (!container) return;
    const btn = document.createElement('button');
    btn.className = 'dla-dl-btn';
    btn.innerHTML = `<i class="ti ti-download"></i> Download`;
    btn.onclick = () => open(fileId, fileName, fileUrl);
    container.innerHTML = '';
    container.appendChild(btn);
  }

  /* ── Public: open the 2FA flow ── */
  async function open(fileId, fileName, fileUrl) {
    const user = firebase.auth().currentUser;
    if (!user) {
      alert('Please sign in to download files.');
      return;
    }

    _fileId   = fileId;
    _fileName = fileName;
    _fileUrl  = fileUrl;

    // Show modal
    $('dlaBackdrop').classList.add('show');
    $('dlaFileName').textContent  = fileName;
    $('dlaUserEmail').textContent = user.email;
    $('dlaSuccessFile').textContent = fileName;
    clearOtpInputs(); clearErr();
    showStep(1);

    // ── Write download request to Firestore ──
    try {
      const ref = await firebase.firestore().collection('downloadRequests').add({
        fileId, fileName, fileUrl,
        userId:    user.uid,
        userEmail: user.email,
        userName:  user.displayName || user.email.split('@')[0],
        status:    'pending',
        requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      _requestId = ref.id;
    } catch (e) {
      alert('Could not send request: ' + e.message);
      $('dlaBackdrop').classList.remove('show');
      return;
    }

    // ── Listen for admin decision in real-time ──
    if (_unsub) _unsub();
    _unsub = firebase.firestore()
      .collection('downloadRequests')
      .doc(_requestId)
      .onSnapshot(async snap => {
        if (!snap.exists) return;
        const data = snap.data();
        if (data.status === 'approved') {
          _unsub && _unsub(); _unsub = null;
          showStep(2);
          updateTriesUI();
          // Send OTP
          try {
            const user = firebase.auth().currentUser;
            await sendOtp(user.email, user.displayName || user.email.split('@')[0], fileName);
            startTimer();
            // Set resend cooldown
            startResendCooldown();
            setTimeout(() => {
              const first = document.querySelector('.otp-digit');
              if (first) first.focus();
            }, 100);
          } catch (e) {
            showErr('Could not send OTP email: ' + e.message);
          }
        } else if (data.status === 'rejected') {
          _unsub && _unsub(); _unsub = null;
          clearInterval(_timerInterval);
          showStep(4);
        }
      });
  }

  /* ── Public: verify OTP ── */
  function verifyOtp() {
    const entered = getOtpValue();
    if (entered.length < 6) { showErr('Enter all 6 digits.'); return; }
    if (Date.now() > _otpExpiry) { showStep(5); return; }

    clearErr();
    _otpTries++;

    if (entered === _otpCode) {
      clearInterval(_timerInterval);
      // Mark request as completed
      firebase.firestore().collection('downloadRequests').doc(_requestId)
        .update({ status: 'completed', completedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(() => {});
      showStep(3);
      // Trigger download
      triggerDownload(_fileUrl, _fileName);
    } else {
      shakeOtp();
      clearOtpInputs();
      setTimeout(() => { const f = document.querySelector('.otp-digit'); if (f) f.focus(); }, 50);
      if (_otpTries >= OTP_MAX_TRIES) {
        clearInterval(_timerInterval);
        showErr(`Too many wrong attempts. Request a new download.`);
        firebase.firestore().collection('downloadRequests').doc(_requestId)
          .update({ status: 'otp_failed' }).catch(() => {});
        setTimeout(() => showStep(5), 1500);
      } else {
        showErr(`Incorrect code. ${OTP_MAX_TRIES - _otpTries} attempt${OTP_MAX_TRIES - _otpTries !== 1 ? 's' : ''} remaining.`);
        updateTriesUI();
      }
    }
  }

  /* ── Public: resend OTP ── */
  async function resendOtp() {
    if (_resendCooldown) return;
    clearErr(); clearOtpInputs();
    const user = firebase.auth().currentUser;
    try {
      await sendOtp(user.email, user.displayName || user.email.split('@')[0], _fileName);
      startTimer();
      startResendCooldown();
      _otpTries = 0; updateTriesUI();
    } catch (e) {
      showErr('Could not resend: ' + e.message);
    }
  }

  function startResendCooldown() {
    _resendCooldown = true;
    const link = $('dlaResendLink');
    if (!link) return;
    let secs = 30;
    link.classList.add('disabled');
    link.textContent = `Resend in ${secs}s`;
    const iv = setInterval(() => {
      secs--;
      if (link) link.textContent = `Resend in ${secs}s`;
      if (secs <= 0) {
        clearInterval(iv);
        _resendCooldown = false;
        if (link) { link.classList.remove('disabled'); link.textContent = 'Resend code'; }
      }
    }, 1000);
  }

  /* ── Trigger browser download ── */
  function triggerDownload(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.target = '_blank';
    document.body.appendChild(a); a.click();
    setTimeout(() => document.body.removeChild(a), 200);
  }

  /* ── Public: close modal ── */
  function close() {
    $('dlaBackdrop').classList.remove('show');
    clearInterval(_timerInterval);
    if (_unsub) { _unsub(); _unsub = null; }
    // Cancel pending request if still waiting
    if (_requestId) {
      firebase.firestore().collection('downloadRequests').doc(_requestId)
        .get().then(snap => {
          if (snap.exists && snap.data().status === 'pending') {
            snap.ref.update({ status: 'cancelled' }).catch(() => {});
          }
        }).catch(() => {});
    }
    _requestId = '';
  }

  return { open, close, verifyOtp, resendOtp, renderBtn };
})();