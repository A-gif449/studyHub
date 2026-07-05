/* ═══════════════════════════════════════════════════════════════
   codespace-download-access.js  — v2
   FLOW:
     Step 1 — OTP sent to user's email
     Step 2 — User verifies OTP
     Step 3 — Live status card (Pending → Approved → Download | Rejected)
              ► Closing the window does NOT cancel the request
              ► On re-open, any pending/approved request is restored
              ► Admin sees a persistent bell notification
   ═══════════════════════════════════════════════════════════════ */

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_TRIES = 3;
const LS_KEY = 'sh_dla_requestId'; // localStorage key to persist request across closes

/* ─────────────────────────────────────────────────────────────
   STYLES
───────────────────────────────────────────────────────────── */
(function injectStyles() {
  const css = `
    #dlaBackdrop {
      display:none;position:fixed;inset:0;z-index:800;
      background:rgba(1,4,9,0.92);backdrop-filter:blur(10px);
      align-items:center;justify-content:center;padding:20px;
    }
    #dlaBackdrop.show { display:flex; }

    .dla-modal {
      background:#161B22;border:1px solid #30363D;border-radius:16px;
      padding:36px 32px;width:100%;max-width:440px;position:relative;
      animation:dlaIn .22s cubic-bezier(.16,1,.3,1);
    }
    @keyframes dlaIn {
      from{opacity:0;transform:translateY(12px) scale(.96)}
      to{opacity:1;transform:translateY(0) scale(1)}
    }
    .dla-modal-x {
      position:absolute;top:14px;right:14px;width:28px;height:28px;
      border-radius:6px;border:1px solid #30363D;background:transparent;
      color:#8B949E;font-size:14px;cursor:pointer;display:flex;
      align-items:center;justify-content:center;transition:all .12s;
    }
    .dla-modal-x:hover{border-color:#444C56;color:#E6EDF3;background:#21262D}
    .dla-step{display:none}
    .dla-step.active{display:block}

    /* ── Floating restore banner ── */
    #dlaPendingBanner {
      display:none;position:fixed;bottom:24px;left:50%;
      transform:translateX(-50%);z-index:790;
      background:#161B22;border:1px solid #30363D;border-radius:12px;
      padding:12px 20px;display:none;align-items:center;gap:14px;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);min-width:320px;max-width:90vw;
      animation:dlaIn .25s ease;
    }
    #dlaPendingBanner.show{display:flex}
    .dlabanner-dot{width:8px;height:8px;border-radius:50%;background:#D29922;
      animation:dlaBlink 1.4s ease infinite;flex-shrink:0}
    @keyframes dlaBlink{0%,100%{opacity:1}50%{opacity:.3}}
    .dlabanner-text{font-size:13px;color:#E6EDF3;font-weight:500;flex:1}
    .dlabanner-text span{color:#8B949E;font-size:12px;display:block;margin-top:2px}
    .dlabanner-btn{padding:7px 14px;border-radius:7px;background:#21262D;
      border:1px solid #30363D;color:#8B949E;font-size:12.5px;font-weight:600;
      cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .15s}
    .dlabanner-btn:hover{color:#E6EDF3;border-color:#444C56}
    .dlabanner-btn.green{background:rgba(35,134,54,0.2);border-color:rgba(46,160,67,0.4);color:#3FB950}
    .dlabanner-btn.green:hover{background:rgba(35,134,54,0.35)}

    /* ── Header ── */
    .dla-header {
      display:flex;flex-direction:column;align-items:center;
      text-align:center;margin-bottom:24px;
    }
    .dla-icon-wrap {
      width:56px;height:56px;border-radius:14px;display:flex;
      align-items:center;justify-content:center;margin-bottom:16px;font-size:26px;
    }
    .dla-icon-wrap.blue  {background:rgba(88,166,255,0.1);border:1px solid rgba(88,166,255,0.2)}
    .dla-icon-wrap.gold  {background:rgba(210,153,34,0.1);border:1px solid rgba(210,153,34,0.2)}
    .dla-icon-wrap.green {background:rgba(63,185,80,0.1);border:1px solid rgba(63,185,80,0.2)}
    .dla-icon-wrap.red   {background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.2)}
    .dla-title {font-size:17px;font-weight:700;color:#E6EDF3;margin-bottom:6px;
      font-family:'Source Serif 4',serif;letter-spacing:-.2px;}
    .dla-sub {font-size:13px;color:#8B949E;line-height:1.65;max-width:320px;}
    .dla-sub b{color:#E6EDF3}

    /* ── Spinner ── */
    .dla-spinner {
      width:48px;height:48px;border-radius:50%;
      border:3px solid #21262D;animation:dlaSpin 1s linear infinite;margin:0 auto 16px;
    }
    .dla-spinner.blue{border-top-color:#58A6FF}
    @keyframes dlaSpin{to{transform:rotate(360deg)}}

    /* ── OTP ── */
    .otp-row{display:flex;gap:8px;justify-content:center;margin:20px 0 8px}
    .otp-digit {
      width:48px;height:56px;border-radius:9px;border:1.5px solid #30363D;
      background:#0D1117;color:#E6EDF3;font-size:24px;font-weight:700;
      text-align:center;outline:none;
      font-family:'JetBrains Mono',ui-monospace,monospace;
      transition:border-color .15s;caret-color:transparent;
    }
    .otp-digit:focus{border-color:#58A6FF}
    .otp-digit.filled{border-color:#444C56}
    .otp-digit.error{border-color:#F85149;animation:dlaShake .35s ease}
    @keyframes dlaShake{
      0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}
      40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}
    }
    .dla-timer{font-size:12px;color:#484F58;text-align:center;margin-bottom:4px}
    .dla-timer span{color:#8B949E;font-weight:600}
    .dla-tries{font-size:12px;color:#8B949E;text-align:center;margin-bottom:16px;min-height:18px}
    .dla-tries.warn{color:#D29922}

    /* ── Error banner ── */
    .dla-err {
      padding:10px 14px;border-radius:8px;
      background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.2);
      color:#F85149;font-size:12.5px;text-align:center;
      margin-bottom:16px;display:none;
    }
    .dla-err.show{display:block}

    /* ── Resend ── */
    .dla-resend{font-size:12px;color:#484F58;text-align:center;margin-top:12px}
    .dla-resend a{color:#58A6FF;cursor:pointer;text-decoration:none}
    .dla-resend a:hover{text-decoration:underline}
    .dla-resend a.off{color:#484F58;pointer-events:none}

    /* ── Buttons ── */
    .dla-btn {
      width:100%;padding:12px;border-radius:8px;border:none;
      font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;
      display:flex;align-items:center;justify-content:center;gap:8px;
      transition:all .15s;margin-top:8px;
    }
    .dla-btn.blue{background:#58A6FF;color:#0D1117}
    .dla-btn.blue:hover{background:#79C0FF}
    .dla-btn.blue:disabled{opacity:.4;cursor:not-allowed}
    .dla-btn.green{background:#238636;color:#fff;border:1px solid #2EA043}
    .dla-btn.green:hover{background:#2EA043}
    .dla-btn.ghost{background:transparent;color:#8B949E;border:1px solid #30363D}
    .dla-btn.ghost:hover{color:#E6EDF3;border-color:#444C56;background:#21262D}
    .dla-btn.danger{background:rgba(248,81,73,0.08);color:#F85149;border:1px solid rgba(248,81,73,0.2)}
    .dla-btn.danger:hover{background:rgba(248,81,73,0.15)}

    /* ── Status card ── */
    .dla-status-card {
      border-radius:10px;border:1px solid #30363D;
      background:#0D1117;overflow:hidden;margin-bottom:20px;
    }
    .dla-status-card-head {
      padding:14px 16px;border-bottom:1px solid #21262D;
      display:flex;align-items:center;gap:10px;
    }
    .dla-status-card-head .file-icon {
      width:34px;height:34px;border-radius:7px;background:#21262D;
      border:1px solid #30363D;display:flex;align-items:center;
      justify-content:center;font-size:16px;flex-shrink:0;
    }
    .dla-status-card-head .file-name {
      font-size:13px;font-weight:600;color:#E6EDF3;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      font-family:'JetBrains Mono',ui-monospace,monospace;
    }
    .dla-status-card-head .file-meta{font-size:11px;color:#484F58;margin-top:2px}
    .dla-status-body{padding:16px}

    /* ── Tracker ── */
    .dla-tracker{display:flex;flex-direction:column;gap:0}
    .dla-track-step{display:flex;align-items:flex-start;gap:12px;position:relative}
    .dla-track-step:not(:last-child)::after{
      content:'';position:absolute;left:15px;top:32px;
      width:2px;height:calc(100% - 8px);background:#21262D;
    }
    .dla-track-dot {
      width:32px;height:32px;border-radius:50%;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;position:relative;z-index:1;
      border:2px solid #30363D;background:#0D1117;transition:all .3s;
    }
    .dla-track-dot.done    {background:#238636;border-color:#2EA043;color:#fff}
    .dla-track-dot.active  {background:#1F3A5A;border-color:#58A6FF;color:#58A6FF}
    .dla-track-dot.active .dla-pulse{
      position:absolute;inset:-4px;border-radius:50%;
      border:2px solid #58A6FF;animation:dlaPulseRing 1.5s ease infinite;
    }
    .dla-track-dot.rejected{background:#3A1F1F;border-color:#F85149;color:#F85149}
    @keyframes dlaPulseRing{0%{transform:scale(1);opacity:.8}100%{transform:scale(1.5);opacity:0}}

    .dla-track-info{padding:4px 0 20px}
    .dla-track-label{font-size:13px;font-weight:600;color:#E6EDF3;margin-bottom:2px}
    .dla-track-label.muted{color:#484F58}
    .dla-track-desc{font-size:12px;color:#8B949E;line-height:1.5}
    .dla-track-desc.muted{color:#30363D}

    /* ── Download / rejected areas ── */
    .dla-download-area {
      margin-top:10px;padding:14px;border-radius:8px;
      background:rgba(35,134,54,0.08);border:1px solid rgba(46,160,67,0.25);
    }
    .dla-download-area .dl-label{
      font-size:12px;color:#3FB950;font-weight:600;
      margin-bottom:10px;display:flex;align-items:center;gap:6px;
    }
    .dla-download-area a {
      display:flex;align-items:center;justify-content:center;gap:8px;
      width:100%;padding:10px;border-radius:7px;
      background:#238636;color:#fff;font-size:13.5px;font-weight:700;
      text-decoration:none;border:1px solid #2EA043;transition:background .15s;
    }
    .dla-download-area a:hover{background:#2EA043}
    .dla-rejected-area {
      margin-top:10px;padding:14px;border-radius:8px;
      background:rgba(248,81,73,0.06);border:1px solid rgba(248,81,73,0.2);
    }
    .dla-rejected-area .rej-label{
      font-size:12px;color:#F85149;font-weight:600;
      display:flex;align-items:center;gap:6px;margin-bottom:4px;
    }
    .dla-rejected-area .rej-desc{font-size:12px;color:#8B949E;line-height:1.5}

    /* ── Trigger button ── */
    .dla-dl-btn {
      display:inline-flex;align-items:center;gap:7px;padding:8px 18px;
      border-radius:7px;background:#238636;color:#fff;border:1px solid #2EA043;
      font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;
    }
    .dla-dl-btn:hover{background:#2EA043}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

/* ─────────────────────────────────────────────────────────────
   MODAL HTML
───────────────────────────────────────────────────────────── */
(function buildModal() {
  const div = document.createElement('div');
  div.id = 'dlaBackdrop';
  div.innerHTML = `
    <div class="dla-modal">
      <button class="dla-modal-x" onclick="SHDownloadAccess.closeModal()">
        <i class="ti ti-x"></i>
      </button>

      <!-- STEP 1: Sending OTP -->
      <div class="dla-step" id="dlaStep1">
        <div class="dla-header">
          <div class="dla-spinner blue"></div>
          <div class="dla-title">Sending verification code</div>
          <p class="dla-sub">Sending a 6-digit code to your email…</p>
        </div>
      </div>

      <!-- STEP 2: OTP entry -->
      <div class="dla-step" id="dlaStep2">
        <div class="dla-header">
          <div class="dla-icon-wrap blue">
            <i class="ti ti-mail" style="font-size:24px;color:#58A6FF"></i>
          </div>
          <div class="dla-title">Enter verification code</div>
          <p class="dla-sub">Sent to <b id="dlaUserEmail"></b></p>
        </div>
        <div class="dla-err" id="dlaOtpErr"></div>
        <div class="otp-row">
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric"/>
          <input class="otp-digit" maxlength="1" type="text" inputmode="numeric"/>
        </div>
        <div class="dla-timer">Expires in <span id="dlaTimerVal">5:00</span></div>
        <div class="dla-tries" id="dlaTries"></div>
        <button class="dla-btn blue" onclick="SHDownloadAccess.verifyOtp()">
          <i class="ti ti-shield-check"></i> Verify & Submit Request
        </button>
        <div class="dla-resend">
          Didn't receive it? <a id="dlaResendLink" onclick="SHDownloadAccess.resendOtp()">Resend code</a>
        </div>
        <button class="dla-btn ghost" onclick="SHDownloadAccess.cancelAndClose()" style="margin-top:6px">
          Cancel
        </button>
      </div>

      <!-- STEP 3: Live status -->
      <div class="dla-step" id="dlaStep3">
        <div style="margin-bottom:20px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;
               letter-spacing:.8px;color:#484F58;margin-bottom:10px">Download Request</div>
          <div class="dla-status-card">
            <div class="dla-status-card-head">
              <div class="file-icon" id="dlaFileIcon">📄</div>
              <div class="file-info">
                <div class="file-name" id="dlaFileName3"></div>
                <div class="file-meta">Identity verified · Awaiting admin</div>
              </div>
            </div>
            <div class="dla-status-body">
              <div class="dla-tracker">
                <div class="dla-track-step">
                  <div class="dla-track-dot done" id="trk1">
                    <i class="ti ti-check" style="font-size:13px"></i>
                  </div>
                  <div class="dla-track-info">
                    <div class="dla-track-label">Request submitted</div>
                    <div class="dla-track-desc">Identity verified via email OTP</div>
                  </div>
                </div>
                <div class="dla-track-step">
                  <div class="dla-track-dot active" id="trk2">
                    <span class="dla-pulse"></span>
                    <i class="ti ti-clock" style="font-size:13px"></i>
                  </div>
                  <div class="dla-track-info">
                    <div class="dla-track-label" id="trk2Label">Waiting for admin</div>
                    <div class="dla-track-desc" id="trk2Desc">
                      You can close this window — we'll update your status automatically when you return.
                    </div>
                  </div>
                </div>
                <div class="dla-track-step">
                  <div class="dla-track-dot" id="trk3" style="color:#484F58">
                    <i class="ti ti-download" style="font-size:13px"></i>
                  </div>
                  <div class="dla-track-info" style="padding-bottom:0">
                    <div class="dla-track-label muted" id="trk3Label">Download</div>
                    <div class="dla-track-desc muted" id="trk3Desc">Available after approval</div>
                    <div id="dlaDownloadArea"></div>
                    <div id="dlaRejectedArea"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button class="dla-btn danger" id="dlaStep3CancelBtn" onclick="SHDownloadAccess.cancelAndClose()">
          <i class="ti ti-x"></i> Cancel request
        </button>
        <button class="dla-btn ghost" id="dlaStep3CloseBtn" onclick="SHDownloadAccess.closeModal()" style="display:none">
          Close
        </button>
      </div>

      <!-- STEP 4: OTP expired -->
      <div class="dla-step" id="dlaStep4">
        <div class="dla-header">
          <div class="dla-icon-wrap gold">
            <i class="ti ti-clock-x" style="font-size:24px;color:#D29922"></i>
          </div>
          <div class="dla-title">Code expired</div>
          <p class="dla-sub">Your verification code has expired. Please start over.</p>
        </div>
        <button class="dla-btn ghost" onclick="SHDownloadAccess.closeModal()">Close</button>
      </div>

    </div>`;
  document.body.appendChild(div);

  /* ── Persistent floating banner (shown when modal is closed but request is pending) ── */
  const banner = document.createElement('div');
  banner.id = 'dlaPendingBanner';
  banner.innerHTML = `
    <div class="dlabanner-dot"></div>
    <div class="dlabanner-text">
      Download request pending
      <span id="dlaBannerSub">Waiting for admin approval…</span>
    </div>
    <button class="dlabanner-btn" id="dlaBannerViewBtn" onclick="SHDownloadAccess.reopenModal()">View status</button>
  `;
  document.body.appendChild(banner);

  /* OTP auto-advance */
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

/* ─────────────────────────────────────────────────────────────
   SHDownloadAccess
───────────────────────────────────────────────────────────── */
window.SHDownloadAccess = (() => {
  let _fileId = '', _fileName = '', _fileUrl = '';
  let _requestId = '';
  let _otpCode = '', _otpExpiry = 0, _otpTries = 0;
  let _timerInterval = null, _unsub = null;
  let _resendCooldown = false;
  let _guestEmail = '';
  let _finalized = false; // approved or rejected

  const $ = id => document.getElementById(id);

  /* ── Step routing ── */
  function showStep(n) {
    for (let i = 1; i <= 4; i++) {
      const el = $(`dlaStep${i}`);
      if (el) el.classList.toggle('active', i === n);
    }
    const es = $('dlaStepEmail');
    if (es) es.classList.remove('active');
  }

  /* ── Errors ── */
  function showErr(msg) { const e=$('dlaOtpErr'); if(e){e.textContent=msg;e.classList.add('show');} }
  function clearErr()   { const e=$('dlaOtpErr'); if(e) e.classList.remove('show'); }

  /* ── OTP helpers ── */
  function clearOtpInputs() {
    document.querySelectorAll('.otp-digit').forEach(d => {
      d.value = ''; d.classList.remove('filled','error');
    });
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

  /* ── Timer ── */
  function startTimer() {
    clearInterval(_timerInterval);
    const end = _otpExpiry;
    _timerInterval = setInterval(() => {
      const rem = Math.max(0, end - Date.now());
      const el = $('dlaTimerVal');
      if (el) el.textContent = `${Math.floor(rem/60000)}:${String(Math.floor((rem%60000)/1000)).padStart(2,'0')}`;
      if (rem === 0) { clearInterval(_timerInterval); showStep(4); }
    }, 1000);
  }

  function updateTriesUI() {
    const el = $('dlaTries'); if (!el) return;
    const left = OTP_MAX_TRIES - _otpTries;
    el.textContent = left < OTP_MAX_TRIES ? `${left} attempt${left!==1?'s':''} remaining` : '';
    el.className = 'dla-tries' + (left <= 1 ? ' warn' : '');
  }

  /* ── File emoji ── */
  function fileEmoji(name) {
    const e = (name||'').split('.').pop().toLowerCase();
    const map = {js:'🟨',jsx:'⚛️',ts:'🔷',tsx:'⚛️',html:'🧡',css:'🎨',py:'🐍',
      java:'☕',c:'🔵',cpp:'🔵',cs:'🟣',go:'🐹',rs:'🦀',md:'📝',
      json:'📦',xml:'📄',sql:'🗄️',sh:'💻',zip:'🗜️',rar:'🗜️',pdf:'📕',
      png:'🖼️',jpg:'🖼️',gif:'🖼️',mp4:'🎬',mp3:'🎵'};
    return map[e] || '📄';
  }

  /* ── Send OTP via Vercel serverless ── */
  async function sendOtp(email, name, fileName) {
    _otpCode   = generateOtp();
    _otpExpiry = Date.now() + OTP_EXPIRY_MS;
    _otpTries  = 0;
    const res = await fetch('/api/send-otp', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, name, fileName, otp: _otpCode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }
  }

  /* ── Floating banner (shown when modal closed, request still active) ── */
  function showBanner(text, subText, btnClass, btnText) {
    const b = $('dlaPendingBanner'); if (!b) return;
    const sub = $('dlaBannerSub'); if (sub) sub.textContent = subText || '';
    const t = b.querySelector('.dlabanner-text');
    if (t) { const node = t.firstChild; if(node) node.textContent = text + '\n'; }
    const btn = $('dlaBannerViewBtn');
    if (btn) {
      btn.className = 'dlabanner-btn' + (btnClass ? ' ' + btnClass : '');
      btn.textContent = btnText || 'View status';
    }
    b.classList.add('show');
  }
  function hideBanner() { const b=$('dlaPendingBanner'); if(b) b.classList.remove('show'); }

  /* ── Write admin notification to Firestore ── */
  async function writeAdminNotification(requestId, fileName, userEmail, userName, status) {
    try {
      await firebase.firestore().collection('adminNotifications').doc(requestId).set({
        type:      'downloadRequest',
        requestId,
        fileName,
        userEmail,
        userName,
        status,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        read:      false,
      }, { merge: true });
    } catch(e) { console.warn('[DLA] adminNotification write failed:', e.message); }
  }

  /* ── Tracker UI: approved ── */
  function renderApproved() {
    _finalized = true;

    const trk2 = $('trk2');
    if (trk2) { trk2.className='dla-track-dot done'; trk2.innerHTML='<i class="ti ti-check" style="font-size:13px"></i>'; }
    const lbl2=$('trk2Label'); if(lbl2){lbl2.textContent='Approved by admin';lbl2.classList.remove('muted');}
    const desc2=$('trk2Desc'); if(desc2) desc2.textContent='Your request was approved.';

    const trk3=$('trk3');
    if (trk3) { trk3.className='dla-track-dot done'; trk3.innerHTML='<i class="ti ti-download" style="font-size:13px"></i>'; }
    const lbl3=$('trk3Label'); if(lbl3){lbl3.textContent='Ready to download';lbl3.classList.remove('muted');}
    const desc3=$('trk3Desc'); if(desc3){desc3.textContent='Your file is ready.';desc3.classList.remove('muted');}

    const area=$('dlaDownloadArea');
    if (area) {
      area.innerHTML = `
        <div class="dla-download-area">
          <div class="dl-label"><i class="ti ti-circle-check"></i> Download ready</div>
          <a href="${_fileUrl}" target="_blank" download="${_fileName}">
            <i class="ti ti-download"></i> Download ${_fileName}
          </a>
        </div>`;
    }

    // Swap buttons: hide cancel, show close
    const cancelBtn=$('dlaStep3CancelBtn'); if(cancelBtn) cancelBtn.style.display='none';
    const closeBtn=$('dlaStep3CloseBtn');   if(closeBtn)  closeBtn.style.display='flex';

    // Auto-trigger download
    try { triggerDownload(_fileUrl, _fileName); } catch(e) {}

    // Update banner if modal was closed
    showBanner('✅ Download approved!', 'Click to download your file.', 'green', 'Download now');
    const bannerBtn=$('dlaBannerViewBtn');
    if(bannerBtn) bannerBtn.onclick = () => { reopenModal(); };

    // Clear localStorage since request is done
    try { localStorage.removeItem(LS_KEY + '_' + firebase.auth().currentUser?.uid); } catch(e) {}
  }

  /* ── Tracker UI: rejected ── */
  function renderRejected() {
    _finalized = true;

    const trk2=$('trk2');
    if (trk2) { trk2.className='dla-track-dot rejected'; trk2.innerHTML='<i class="ti ti-x" style="font-size:13px"></i>'; }
    const lbl2=$('trk2Label'); if(lbl2) lbl2.textContent='Request rejected';
    const desc2=$('trk2Desc'); if(desc2) desc2.textContent='The admin declined this request.';
    const lbl3=$('trk3Label'); if(lbl3) lbl3.textContent='Download unavailable';

    const area=$('dlaRejectedArea');
    if (area) {
      area.innerHTML = `
        <div class="dla-rejected-area">
          <div class="rej-label"><i class="ti ti-shield-x"></i> Access denied</div>
          <div class="rej-desc">Contact the admin if you believe this was a mistake.</div>
        </div>`;
    }

    const cancelBtn=$('dlaStep3CancelBtn'); if(cancelBtn) cancelBtn.style.display='none';
    const closeBtn=$('dlaStep3CloseBtn');   if(closeBtn)  closeBtn.style.display='flex';

    showBanner('❌ Request rejected', 'Open to see details.', '', 'View details');
    try { localStorage.removeItem(LS_KEY + '_' + firebase.auth().currentUser?.uid); } catch(e) {}
  }

  /* ── Subscribe to Firestore request doc ── */
  function subscribeToRequest(requestId) {
    if (_unsub) { _unsub(); _unsub = null; }
    if (!requestId) return;
    _unsub = firebase.firestore()
      .collection('downloadRequests')
      .doc(requestId)
      .onSnapshot(snap => {
        if (!snap.exists || _finalized) return;
        const { status } = snap.data();
        if (status === 'approved') {
          _unsub && _unsub(); _unsub = null;
          renderApproved();
          snap.ref.update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
          }).catch(() => {});
        } else if (status === 'rejected') {
          _unsub && _unsub(); _unsub = null;
          renderRejected();
        }
      }, err => {
        console.warn('[DLA] snapshot error:', err.message);
      });
  }

  /* ── Reset tracker UI to pending state ── */
  function resetTrackerToPending() {
    _finalized = false;
    const trk2=$('trk2');
    if(trk2){trk2.className='dla-track-dot active';trk2.innerHTML='<span class="dla-pulse"></span><i class="ti ti-clock" style="font-size:13px"></i>';}
    const trk3=$('trk3');
    if(trk3){trk3.className='dla-track-dot';trk3.style.color='#484F58';trk3.innerHTML='<i class="ti ti-download" style="font-size:13px"></i>';}
    const lbl2=$('trk2Label'); if(lbl2){lbl2.textContent='Waiting for admin';lbl2.classList.remove('muted');}
    const desc2=$('trk2Desc'); if(desc2) desc2.textContent="You can close this window — we'll update your status automatically when you return.";
    const lbl3=$('trk3Label'); if(lbl3){lbl3.textContent='Download';lbl3.className='dla-track-label muted';}
    const desc3=$('trk3Desc'); if(desc3){desc3.textContent='Available after approval';desc3.className='dla-track-desc muted';}
    const da=$('dlaDownloadArea'); if(da) da.innerHTML='';
    const ra=$('dlaRejectedArea'); if(ra) ra.innerHTML='';
    const cancelBtn=$('dlaStep3CancelBtn'); if(cancelBtn) cancelBtn.style.display='flex';
    const closeBtn=$('dlaStep3CloseBtn');   if(closeBtn)  closeBtn.style.display='none';
  }

  /* ── Check for an existing pending request on page load ── */
  async function checkExistingRequest() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const lsKey = LS_KEY + '_' + user.uid;
    const savedId = localStorage.getItem(lsKey);
    if (!savedId) return;

    try {
      const snap = await firebase.firestore().collection('downloadRequests').doc(savedId).get();
      if (!snap.exists) { localStorage.removeItem(lsKey); return; }
      const data = snap.data();
      if (data.status === 'cancelled' || data.status === 'completed') {
        localStorage.removeItem(lsKey); return;
      }

      // Restore state
      _requestId = savedId;
      _fileId    = data.fileId   || '';
      _fileName  = data.fileName || '';
      _fileUrl   = data.fileUrl  || '';

      // Set modal file info
      const fn3=$('dlaFileName3'); if(fn3) fn3.textContent=_fileName;
      const fi=$('dlaFileIcon');   if(fi)  fi.textContent=fileEmoji(_fileName);

      if (data.status === 'approved') {
        // Already approved before user returned — show download immediately
        resetTrackerToPending();
        renderApproved();
        showBanner('✅ Download approved!', 'Your file is ready.', 'green', 'Download now');
        const bannerBtn=$('dlaBannerViewBtn');
        if(bannerBtn) bannerBtn.onclick = () => reopenModal();
        return;
      }
      if (data.status === 'rejected') {
        resetTrackerToPending();
        renderRejected();
        showBanner('❌ Request rejected', 'Open to see details.', '', 'View details');
        return;
      }

      // Still pending — show banner, subscribe
      resetTrackerToPending();
      showBanner('Download request pending', 'Waiting for admin approval…', '', 'View status');
      subscribeToRequest(_requestId);

    } catch(e) {
      console.warn('[DLA] checkExistingRequest error:', e.message);
    }
  }

  /* ── Internal: proceed once email is confirmed ── */
  async function _proceedWithEmail(email, name, fileName) {
    _guestEmail = email;
    _finalized  = false;
    resetTrackerToPending();

    $('dlaBackdrop').classList.add('show');
    const ef=$('dlaStepEmail'); if(ef) ef.classList.remove('active');

    $('dlaUserEmail').textContent = email;
    clearOtpInputs(); clearErr();
    showStep(1);

    try {
      await sendOtp(email, name, fileName);
      startTimer();
      startResendCooldown();
      showStep(2);
      setTimeout(() => { const f=document.querySelector('.otp-digit'); if(f) f.focus(); }, 80);
    } catch(e) {
      showStep(2);
      showErr('Could not send code: ' + e.message + ' — try resending.');
    }
  }

  /* ── Public: renderBtn — renders a download trigger button ── */
  function renderBtn(fileId, fileName, fileUrl, container) {
    if (!container) return;
    const btn = document.createElement('button');
    btn.className = 'dla-dl-btn';
    btn.innerHTML = `<i class="ti ti-download"></i> Download`;
    btn.onclick = () => open(fileId, fileName, fileUrl);
    container.innerHTML = '';
    container.appendChild(btn);
  }

  /* ── Public: open — entry point ── */
  async function open(fileId, fileName, fileUrl) {
    const user = firebase.auth().currentUser;
    if (!user) { alert('Please sign in to download files.'); return; }

    _fileId   = fileId;
    _fileName = fileName;
    _fileUrl  = fileUrl;
    _requestId = '';
    _finalized = false;

    const fn3=$('dlaFileName3'); if(fn3) fn3.textContent=fileName;
    const fi=$('dlaFileIcon');   if(fi)  fi.textContent=fileEmoji(fileName);

    if (!user.email) {
      $('dlaBackdrop').classList.add('show');
      showEmailCollectionStep(fileName);
      return;
    }
    _proceedWithEmail(user.email, user.displayName || user.email.split('@')[0], fileName);
  }

  /* ── Public: verifyOtp ── */
  async function verifyOtp() {
    const entered = getOtpValue();
    if (entered.length < 6) { showErr('Enter all 6 digits.'); return; }
    if (Date.now() > _otpExpiry) { showStep(4); return; }
    clearErr();
    _otpTries++;

    if (entered !== _otpCode) {
      shakeOtp(); clearOtpInputs();
      setTimeout(() => { const f=document.querySelector('.otp-digit'); if(f) f.focus(); }, 50);
      if (_otpTries >= OTP_MAX_TRIES) {
        clearInterval(_timerInterval);
        showErr('Too many wrong attempts.');
        setTimeout(() => showStep(4), 1200);
      } else {
        const left = OTP_MAX_TRIES - _otpTries;
        showErr(`Incorrect code. ${left} attempt${left!==1?'s':''} remaining.`);
        updateTriesUI();
      }
      return;
    }

    // ✅ OTP correct
    clearInterval(_timerInterval);
    showStep(3);

    const user = firebase.auth().currentUser;
    const userEmail = user.email || _guestEmail;
    const userName  = user.displayName || userEmail.split('@')[0];

    try {
      const ref = await firebase.firestore().collection('downloadRequests').add({
        fileId: _fileId, fileName: _fileName, fileUrl: _fileUrl,
        userId:   user.uid,
        userEmail,
        userName,
        status:   'pending',
        otpVerified: true,
        requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      _requestId = ref.id;

      // Persist request ID so we can restore on page reload
      try { localStorage.setItem(LS_KEY + '_' + user.uid, _requestId); } catch(e) {}

      // Write admin notification
      await writeAdminNotification(_requestId, _fileName, userEmail, userName, 'pending');

    } catch(e) {
      console.warn('[DLA] Firestore write failed:', e.message);
    }

    // Listen for admin decision
    subscribeToRequest(_requestId);
  }

  /* ── Public: resendOtp ── */
  async function resendOtp() {
    if (_resendCooldown) return;
    clearErr(); clearOtpInputs();
    const user = firebase.auth().currentUser;
    const email = (user && user.email) || _guestEmail;
    const name  = (user && user.displayName) || email.split('@')[0];
    try {
      await sendOtp(email, name, _fileName);
      startTimer(); startResendCooldown();
      _otpTries = 0; updateTriesUI();
    } catch(e) { showErr('Could not resend: ' + e.message); }
  }

  function startResendCooldown() {
    _resendCooldown = true;
    const link = $('dlaResendLink'); if (!link) return;
    let secs = 30;
    link.classList.add('off'); link.textContent = `Resend in ${secs}s`;
    const iv = setInterval(() => {
      secs--;
      if(link) link.textContent = `Resend in ${secs}s`;
      if (secs <= 0) {
        clearInterval(iv); _resendCooldown = false;
        if(link){ link.classList.remove('off'); link.textContent='Resend code'; }
      }
    }, 1000);
  }

  /* ── Public: closeModal — hides modal but KEEPS listener & shows banner ── */
  function closeModal() {
    $('dlaBackdrop').classList.remove('show');
    clearInterval(_timerInterval);
    // Do NOT unsubscribe _unsub — keep listening in background
    // Show persistent banner only if we have an active pending request
    if (_requestId && !_finalized) {
      showBanner('Download request pending', 'Waiting for admin approval…', '', 'View status');
    }
  }

  /* ── Public: cancelAndClose — explicitly cancels the request ── */
  function cancelAndClose() {
    if (_requestId && !_finalized) {
      firebase.firestore().collection('downloadRequests').doc(_requestId)
        .get().then(snap => {
          if (snap.exists && snap.data().status === 'pending') {
            snap.ref.update({ status: 'cancelled' }).catch(() => {});
            // Remove admin notification
            firebase.firestore().collection('adminNotifications').doc(_requestId)
              .update({ status: 'cancelled' }).catch(() => {});
          }
        }).catch(() => {});
      try { localStorage.removeItem(LS_KEY + '_' + firebase.auth().currentUser?.uid); } catch(e) {}
    }
    $('dlaBackdrop').classList.remove('show');
    hideBanner();
    clearInterval(_timerInterval);
    if (_unsub) { _unsub(); _unsub = null; }
    _requestId = '';
  }

  /* ── Public: reopenModal — reopen to show current status ── */
  function reopenModal() {
    $('dlaBackdrop').classList.add('show');
    hideBanner();
    showStep(3);
  }

  function triggerDownload(url, name) {
    const a = document.createElement('a');
    a.href=url; a.download=name; a.target='_blank';
    document.body.appendChild(a); a.click();
    setTimeout(() => document.body.removeChild(a), 200);
  }

  /* ── Guest email step ── */
  function showEmailCollectionStep(fileName) {
    if (!$('dlaStepEmail')) {
      const modal = document.querySelector('.dla-modal');
      const step  = document.createElement('div');
      step.className='dla-step'; step.id='dlaStepEmail';
      step.innerHTML = `
        <div class="dla-header">
          <div class="dla-icon-wrap blue">
            <i class="ti ti-mail" style="font-size:24px;color:#58A6FF"></i>
          </div>
          <div class="dla-title">Enter your email</div>
          <p class="dla-sub">You're signed in as a guest. Enter your email to receive a verification code for <b>${fileName}</b>.</p>
        </div>
        <div class="dla-err" id="dlaEmailErr"></div>
        <input type="email" id="dlaGuestEmail" placeholder="your@email.com"
          style="width:100%;padding:11px 14px;background:#0D1117;border:1.5px solid #30363D;
                 border-radius:8px;color:#E6EDF3;font-size:14px;font-family:inherit;
                 outline:none;transition:border-color .15s;margin-bottom:14px;"
          onfocus="this.style.borderColor='#58A6FF'"
          onblur="this.style.borderColor='#30363D'"
          onkeydown="if(event.key==='Enter')SHDownloadAccess.submitGuestEmail()"/>
        <button class="dla-btn blue" onclick="SHDownloadAccess.submitGuestEmail()">
          <i class="ti ti-send"></i> Send Verification Code
        </button>
        <button class="dla-btn ghost" onclick="SHDownloadAccess.cancelAndClose()">Cancel</button>`;
      modal.insertBefore(step, modal.querySelector('.dla-modal-x').nextSibling);
    }
    for(let i=1;i<=4;i++){const e=$(`dlaStep${i}`);if(e)e.classList.remove('active');}
    $('dlaStepEmail').classList.add('active');
    setTimeout(()=>{const e=$('dlaGuestEmail');if(e){e.value='';e.focus();}},80);
  }

  async function submitGuestEmail() {
    const inp=$('dlaGuestEmail'), errEl=$('dlaEmailErr');
    const email = inp ? inp.value.trim() : '';
    if (errEl) errEl.classList.remove('show');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if(errEl){errEl.textContent='Please enter a valid email address.';errEl.classList.add('show');}
      return;
    }
    const btn = $('dlaStepEmail').querySelector('.dla-btn.blue');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Sending…';}
    await _proceedWithEmail(email, 'Guest', _fileName);
  }

  /* ── Auto-check existing request when Firebase auth is ready ── */
  // (call after firebase.initializeApp in your page)
  function init() {
    firebase.auth().onAuthStateChanged(user => {
      if (user) checkExistingRequest();
      else hideBanner();
    });
  }

  return {
    init,
    open,
    closeModal,
    cancelAndClose,
    reopenModal,
    verifyOtp,
    resendOtp,
    renderBtn,
    submitGuestEmail,
  };
})();