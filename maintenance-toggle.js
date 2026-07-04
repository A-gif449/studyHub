/**
 * StudyHub — Maintenance Mode Toggle
 * ─────────────────────────────────────────────────────────────────
 * HOW TO USE
 *
 *   1. Copy maintenance.html into your project root (same folder as index.html).
 *
 *   2. Add ONE line at the very top of index.html's first <script> block:
 *
 *        window.MAINTENANCE_MODE = true;   ← maintenance ON
 *        window.MAINTENANCE_MODE = false;  ← maintenance OFF  (normal site)
 *
 *   3. Paste this file as  maintenance-toggle.js  in your project root.
 *
 *   4. Add this tag to index.html's <head>, BEFORE any other scripts:
 *
 *        <script src="maintenance-toggle.js"></script>
 *
 *   That's it. Flip the flag and push — no other changes needed.
 *
 * ADMIN BYPASS
 *   Admins can still view the live site during maintenance by visiting:
 *       index.html?bypass=studyhub_admin
 *
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  var MAINTENANCE = window.MAINTENANCE_MODE === true;

  if (!MAINTENANCE) return; // ← site is live, do nothing

  // Allow admins to bypass via ?bypass=studyhub_admin
  var params = new URLSearchParams(window.location.search);
  if (params.get('bypass') === 'studyhub_admin') {
    sessionStorage.setItem('sh_bypass', '1');
  }
  if (sessionStorage.getItem('sh_bypass') === '1') {
    // Show a small "maintenance mode active" banner for the admin
    document.addEventListener('DOMContentLoaded', function () {
      var bar = document.createElement('div');
      bar.style.cssText = [
        'position:fixed;top:0;left:0;right:0;z-index:99999',
        'background:rgba(201,163,86,0.12);border-bottom:1px solid rgba(201,163,86,0.3)',
        'color:#C9A356;font-size:12px;font-weight:600;font-family:Inter,sans-serif',
        'padding:8px 20px;display:flex;align-items:center;gap:10px;letter-spacing:.2px'
      ].join(';');
      bar.innerHTML =
        '<span style="width:6px;height:6px;border-radius:50%;background:#C9A356;flex-shrink:0"></span>' +
        'Maintenance mode is active — only you can see this page.' +
        '<a href="?bypass=clear" onclick="sessionStorage.removeItem(\'sh_bypass\');location.href=\'maintenance.html\';return false;" ' +
        'style="margin-left:auto;color:#C9A356;font-size:11px;text-decoration:underline;cursor:pointer">Exit admin view</a>';
      document.body.style.paddingTop = '36px';
      document.body.prepend(bar);
    });
    return; // admin sees the real site
  }

  // Everyone else → redirect to maintenance page
  if (!window.location.pathname.endsWith('maintenance.html')) {
    window.location.replace('maintenance.html');
  }
})();