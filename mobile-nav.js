//mobile-nav.js
(function () {
  "use strict";

  let currentUser = null;
  let drawerOpen = false;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    buildHamburger();
    buildDrawer();
    watchAuth();
     setTimeout(function() { renderDrawerContent(currentUser); }, 500);
    // Chat-only: floating "rooms" shortcut for the sidebar list
    if (document.getElementById("roomsList")) {
      buildRoomsSheet();
    }
  }

  /* ══════════════════════════════════════════
     PAGE DETECTION
     ══════════════════════════════════════════ */
  function currentPage() {
    const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    return path === "" ? "index.html" : path;
  }

  function isAdminEmail(email) {
    return !!(email && window.ADMIN_EMAILS && window.ADMIN_EMAILS.includes(email));
  }

  /* ══════════════════════════════════════════
     1. HAMBURGER BUTTON
     ══════════════════════════════════════════ */
function buildHamburger() {
    const nav = document.querySelector("nav");
    if (!nav || document.getElementById("sh-hamburger")) return;

    const btn = document.createElement("button");
    btn.id = "sh-hamburger";
    btn.setAttribute("aria-label", "Open menu");
    btn.innerHTML =
      '<span class="sh-bar"></span><span class="sh-bar"></span><span class="sh-bar"></span>';
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDrawer();
    });

    // Always append to end of nav-right
    const navRight = nav.querySelector(".nav-right");
    if (navRight) {
      navRight.style.display = "flex";
      navRight.style.alignItems = "center";
      navRight.style.gap = "8px";
      navRight.appendChild(btn);
    } else {
      nav.appendChild(btn);
    }
  }

  /* ══════════════════════════════════════════
     2. DRAWER SHELL
     ══════════════════════════════════════════ */
  function buildDrawer() {
    if (document.getElementById("sh-drawer")) return;

    const wrap = document.createElement("div");
    wrap.id = "sh-drawer";
    wrap.innerHTML =
      '<div id="sh-drawer-backdrop"></div>' +
      '<div id="sh-drawer-panel" role="dialog" aria-modal="true" aria-label="Navigation menu"></div>';
    document.body.appendChild(wrap);

    wrap
      .querySelector("#sh-drawer-backdrop")
      .addEventListener("click", closeDrawer);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawerOpen) closeDrawer();
    });

    renderDrawerContent(currentUser || null); // guest state until auth resolves
  }

  function toggleDrawer() {
    drawerOpen ? closeDrawer() : openDrawer();
  }

  function openDrawer() {
    drawerOpen = true;
    document.getElementById("sh-drawer").classList.add("open");
    document.getElementById("sh-hamburger").classList.add("open");
    document.body.style.overflow = "hidden";
    // restart stagger animation each time it opens
    const items = document.querySelectorAll("#sh-drawer-panel .sh-drawer-item");
    items.forEach(function (it) {
      it.style.animation = "none";
      void it.offsetWidth;
      it.style.animation = "";
    });
  }

  function closeDrawer() {
    drawerOpen = false;
    document.getElementById("sh-drawer").classList.remove("open");
    document.getElementById("sh-hamburger").classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ══════════════════════════════════════════
     3. AUTH WATCHER
     ══════════════════════════════════════════ */
  function watchAuth() {
    waitForFirebaseAuth(function (auth) {
      auth.onAuthStateChanged(function (user) {
        currentUser = user;
        renderDrawerContent(user);
      });
    });
  }

  function waitForFirebaseAuth(cb) {
    if (
      typeof firebase !== "undefined" &&
      firebase.apps &&
      firebase.apps.length &&
      firebase.auth
    ) {
      cb(firebase.auth());
    } else {
      setTimeout(function () {
        waitForFirebaseAuth(cb);
      }, 250);
    }
  }

  /* ══════════════════════════════════════════
     4. DRAWER CONTENT
     ══════════════════════════════════════════ */
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initials(name) {
    return String(name || "?")
      .split(" ")
      .map(function (w) { return w[0]; })
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function navItem(opts) {
    // opts: { href, icon, chip, title, sub, page, onclick }
    const isActive = opts.page && opts.page === currentPage();
    const tag = opts.onclick ? "button" : "a";
    const attrs = opts.onclick
      ? 'onclick="' + opts.onclick + '"'
      : 'href="' + opts.href + '"';
    return (
      "<" + tag + " class=\"sh-drawer-item" + (isActive ? " active" : "") + "\" " + attrs + ">" +
        '<span class="sh-drawer-icon-chip ' + opts.chip + '"><i class="ti ' + opts.icon + '"></i></span>' +
        '<span class="sh-drawer-item-label">' +
          '<span class="sh-drawer-item-title">' + esc(opts.title) + "</span>" +
          (opts.sub ? '<span class="sh-drawer-item-sub">' + esc(opts.sub) + "</span>" : "") +
        "</span>" +
        '<i class="ti ti-chevron-right sh-drawer-chevron"></i>' +
      "</" + tag + ">"
    );
  }

  function sectionLabel(text) {
    return '<div class="sh-drawer-section-label">' + esc(text) + "</div>";
  }

  function renderDrawerContent(user) {
    const panel = document.getElementById("sh-drawer-panel");
    if (!panel) return;

    const admin = isAdminEmail(user && user.email);

    /* ── Hero / profile header ── */
    let heroInner =
      '<div class="sh-drawer-blob b1"></div>' +
      '<div class="sh-drawer-blob b2"></div>' +
      '<div class="sh-drawer-blob b3"></div>' +
      '<div class="sh-drawer-top-row">' +
        '<a href="index.html" class="sh-drawer-logo">' +
          '<img src="logo.png" onerror="this.style.display=\'none\'" alt=""/> StudyHub' +
        "</a>" +
        '<button class="sh-drawer-close" aria-label="Close menu" onclick="window._shCloseDrawer()"><i class="ti ti-x"></i></button>' +
      "</div>";

    if (user) {
      const name = user.displayName || user.email.split("@")[0];
      heroInner +=
        '<div class="sh-drawer-profile">' +
          '<div class="sh-drawer-av">' + esc(initials(name)) + "</div>" +
          '<div class="sh-drawer-user-info">' +
            '<div class="sh-drawer-name">' + esc(name) + "</div>" +
            '<div class="sh-drawer-email">' + esc(user.email) + "</div>" +
            '<span class="sh-drawer-role-chip' + (admin ? " admin" : "") + '">' +
              (admin ? "👑 Admin" : "📘 Member") +
            "</span>" +
          "</div>" +
        "</div>";
    } else {
      heroInner +=
        '<div class="sh-drawer-guest-card">' +
          '<div class="sh-drawer-guest-text">Welcome to StudyHub<span>Sign in to unlock the library</span></div>' +
          '<button class="sh-drawer-guest-btn" onclick="window._shGoLogin()">Sign In</button>' +
        "</div>";
    }

    /* ── Nav items ── */
    let nav = "";
    nav += sectionLabel("Explore");
    nav += navItem({ href: "index.html", icon: "ti-home", chip: "chip-violet", title: "Home", sub: "Browse the PDF library", page: "index.html" });
    nav += navItem({ href: "index.html#materials", icon: "ti-books", chip: "chip-blue", title: "Materials", sub: "All subjects & levels" });
    nav += navItem({ href: "chat.html", icon: "ti-messages", chip: "chip-pink", title: "Community Chat", sub: "Talk with other learners", page: "chat.html" });
    nav += navItem({ href: "friends.html", icon: "ti-users", chip: "chip-green", title: "Friends", sub: "Requests & suggestions", page: "friends.html" });

    if (user) {
      nav += '<div class="sh-drawer-divider"></div>';
      nav += sectionLabel("You");
      nav += navItem({ href: "profile.html", icon: "ti-user", chip: "chip-gold", title: "My Profile", sub: "Activity & stats", page: "profile.html" });
      if (admin) {
        nav += navItem({ href: "admin.html", icon: "ti-shield-check", chip: "chip-red", title: "Admin Panel", sub: "Manage the library", page: "admin.html" });
      }
    }

    panel.innerHTML =
      '<div class="sh-drawer-hero">' + heroInner + "</div>" +
      '<nav class="sh-drawer-nav">' + nav + "</nav>" +
      (user
        ? '<div class="sh-drawer-footer"><button class="sh-drawer-signout" onclick="window._shSignOut()"><i class="ti ti-logout"></i> Sign Out</button></div>'
        : "");
  }

  /* exposed helpers for inline handlers */
  window._shCloseDrawer = closeDrawer;
  window._shGoLogin = function () {
    closeDrawer();
    const page = currentPage();
    window.location.href = page === "index.html" ? "index.html?login=1" : "index.html?login=1";
  };
  window._shSignOut = function () {
    closeDrawer();
    waitForFirebaseAuth(function (auth) {
      auth.signOut().then(function () {
        window.location.href = "index.html";
      });
    });
  };

  /* close drawer automatically after any nav-item tap (links navigate anyway,
     but this keeps state clean for SPA-like same-page anchors) */
  document.addEventListener("click", function (e) {
    const item = e.target.closest && e.target.closest(".sh-drawer-item");
    if (item && item.tagName === "A") {
      setTimeout(closeDrawer, 150);
    }
  });

  /* ══════════════════════════════════════════
     5. CHAT ROOMS BOTTOM SHEET (chat.html only)
     ══════════════════════════════════════════ */
  function buildRoomsSheet() {
    if (document.getElementById("sh-rooms-fab")) return;

    const fab = document.createElement("button");
    fab.id = "sh-rooms-fab";
    fab.setAttribute("aria-label", "Browse rooms");
    fab.innerHTML = '<i class="ti ti-layout-grid"></i>';
    document.body.appendChild(fab);

    const sheet = document.createElement("div");
    sheet.id = "sh-rooms-drawer";
    sheet.innerHTML =
      '<div id="sh-rooms-drawer-backdrop"></div>' +
      '<div id="sh-rooms-drawer-sheet">' +
        '<div class="sh-rooms-pill"></div>' +
        '<div class="sh-rooms-title">Rooms</div>' +
        '<div class="sh-rooms-list" id="sh-rooms-list"></div>' +
      "</div>";
    document.body.appendChild(sheet);

    function openSheet() {
      // mirror the existing #roomsList into the sheet right before opening
      const source = document.getElementById("roomsList");
      const target = document.getElementById("sh-rooms-list");
      if (source && target) {
        target.innerHTML = source.innerHTML
          .replace(/class="room-item/g, 'class="sh-room-item')
          .replace(/class="room-icon"/g, 'class="sh-room-icon"')
          .replace(/class="room-info"/g, 'class="sh-room-info"')
          .replace(/class="room-name"/g, 'class="sh-room-name"')
          .replace(/class="room-desc"/g, 'class="sh-room-desc"');
      }
      sheet.classList.add("open");
    }
    function closeSheet() {
      sheet.classList.remove("open");
    }

    fab.addEventListener("click", openSheet);
    sheet
      .querySelector("#sh-rooms-drawer-backdrop")
      .addEventListener("click", closeSheet);

    // tapping a mirrored room item should trigger the real switchRoom() and close
    sheet.addEventListener("click", function (e) {
      const item = e.target.closest(".sh-room-item");
      if (item && item.id && typeof window.switchRoom === "function") {
        const roomId = item.id.replace("room-", "");
        window.switchRoom(roomId);
        closeSheet();
      }
    });
  }
})();