(function () {
  // Themes: system → light → dark → system → …
  var THEMES = ["system", "light", "dark"];
  var LABELS = { system: "Auto", light: "Light", dark: "Dark" };

  // Lucide-style SVG icons (stroke-based, 14px)
  var ICONS = {
    system: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    light:  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>',
    dark:   '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
  };
  var KEY    = "boarda-status-theme";

  function getStored() {
    try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; }
  }

  function setStored(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) {}
  }

  function apply(theme) {
    var html = document.documentElement;
    if (theme === "system") {
      html.removeAttribute("data-theme");
    } else {
      html.setAttribute("data-theme", theme);
    }
    // Update active button
    THEMES.forEach(function (t) {
      var btn = document.getElementById("boarda-theme-btn-" + t);
      if (btn) btn.className = t === theme ? "active" : "";
    });
  }

  function removeStatusEmoji() {
    // Remove ✅ ⚠️ 🔴 emoji from status indicator text (Upptime injects these)
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) {
      if (/[\u2705\u26A0\uFE0F\uD83D\uDD34]/.test(node.textContent)) nodes.push(node);
    }
    nodes.forEach(function (n) {
      n.textContent = n.textContent
        .replace(/✅\s*/g, "")
        .replace(/⚠️\s*/g, "")
        .replace(/🔴\s*/g, "");
    });
  }

  function init() {
    var current = getStored();
    apply(current);
    removeStatusEmoji();

    var wrap = document.createElement("div");
    wrap.id = "boarda-theme-toggle";
    wrap.title = "Switch theme";

    THEMES.forEach(function (t) {
      var btn = document.createElement("button");
      btn.id = "boarda-theme-btn-" + t;
      btn.title = LABELS[t];
      btn.innerHTML = ICONS[t] + '<span style="margin-left:5px">' + LABELS[t] + '</span>';
      btn.className = t === current ? "active" : "";
      btn.addEventListener("click", function () {
        setStored(t);
        apply(t);
      });
      wrap.appendChild(btn);
    });

    document.body.appendChild(wrap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Apply stored theme immediately before paint to avoid flash
  (function () {
    var t = getStored();
    if (t !== "system") document.documentElement.setAttribute("data-theme", t);
  })();
})();
