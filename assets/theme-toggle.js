(function () {
  // Themes: system → light → dark → system → …
  var THEMES = ["system", "light", "dark"];
  var ICONS  = { system: "💻", light: "☀️", dark: "🌙" };
  var LABELS = { system: "System", light: "Light", dark: "Dark" };
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

  function init() {
    var current = getStored();
    apply(current);

    var wrap = document.createElement("div");
    wrap.id = "boarda-theme-toggle";
    wrap.title = "Switch theme";

    THEMES.forEach(function (t) {
      var btn = document.createElement("button");
      btn.id = "boarda-theme-btn-" + t;
      btn.textContent = ICONS[t];
      btn.title = LABELS[t];
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
