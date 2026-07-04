(function () {
  var MAINTENANCE      = window.MAINTENANCE_MODE === true;
  var MAINTENANCE_PAGE = 'maintanence.html';   // your actual filename
  var MAIN_PAGE        = 'index.html';

  var path    = window.location.pathname;
  var page    = path.split('/').pop() || 'index.html';
  var onMaint = page === MAINTENANCE_PAGE;

  // ── Admin bypass via ?bypass=studyhub_admin ──────────────────
  var params = new URLSearchParams(window.location.search);
  if (params.get('bypass') === 'studyhub_admin') {
    sessionStorage.setItem('sh_bypass', '1');
  }
  var isAdmin = sessionStorage.getItem('sh_bypass') === '1';

  // ── MAINTENANCE IS ON ────────────────────────────────────────
  if (MAINTENANCE) {
    if (isAdmin) {
      // Admin sees live site with a gold warning bar
      document.addEventListener('DOMContentLoaded', function () {
        var style = document.createElement('style');
        style.textContent = '@keyframes sh-blink{0%,100%{opacity:1}50%{opacity:.3}}';
        document.head.appendChild(style);

        var bar = document.createElement('div');
        bar.style.cssText =
          'position:fixed;top:0;left:0;right:0;z-index:99999;' +
          'background:rgba(201,163,86,0.13);border-bottom:1px solid rgba(201,163,86,0.28);' +
          'color:#C9A356;font-size:12px;font-weight:600;font-family:Inter,sans-serif;' +
          'padding:8px 20px;display:flex;align-items:center;gap:10px;letter-spacing:.2px;';
        bar.innerHTML =
          '<span style="width:6px;height:6px;border-radius:50%;background:#C9A356;' +
          'animation:sh-blink 2s ease infinite;flex-shrink:0"></span>' +
          'Maintenance mode is <strong style="color:#C9A356;margin:0 3px">ON</strong> ' +
          '— only you (admin) can see this.' +
          '<a href="javascript:void(0)" ' +
          'onclick="sessionStorage.removeItem(\'sh_bypass\');window.location.href=\'' + MAINTENANCE_PAGE + '\'" ' +
          'style="margin-left:auto;color:#C9A356;font-size:11px;text-decoration:underline;cursor:pointer;">' +
          'Exit admin view →</a>';

        document.body.style.paddingTop = '36px';
        document.body.prepend(bar);
      });
      return; // let admin through
    }

    // Everyone else: redirect to maintenance page if not already there
    if (!onMaint) {
      window.location.replace(MAINTENANCE_PAGE);
    }
    return;
  }

  // ── MAINTENANCE IS OFF ───────────────────────────────────────
  // If someone directly visits maintanence.html while site is live,
  // send them back to index
  if (onMaint) {
    window.location.replace(MAIN_PAGE);
  }

})();