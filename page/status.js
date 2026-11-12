/* Boarda Status (BRDSPRINT-468).
   Upptime keeps doing the monitoring in this repo. This page only reads what it writes:
   - history/summary.json      names, slugs, URLs and dailyMinutesDown per service
   - history/<slug>.yml        the latest check result per service
   - GitHub issues             label "status" = incidents (Upptime opens and closes them),
                               label "maintenance" = scheduled maintenance
   - the Uptime CI workflow    time of the last completed check run */
(function () {
  "use strict";

  var REPO = "boarda/boarda-status";
  var RAW = "https://raw.githubusercontent.com/" + REPO + "/main";
  var API = "https://api.github.com/repos/" + REPO;
  var ISSUES_URL = "https://github.com/" + REPO + "/issues?q=label%3Astatus";
  var DAYS = 90;
  var DAY_MS = 864e5;
  var REFRESH_MS = 5 * 60 * 1000;
  var HISTORY_LIMIT = 10;
  var THEME_KEY = "boarda-status-theme";

  // What the page lists. Each row is a product or a variant of one, backed by one or more
  // Upptime checks (slugs in .upptimerc.yml). Native apps have no address to check: they run
  // on the Boarda API, so they show the API's check and say so.
  var NATIVE = "Runs on the Boarda API";
  var CATALOG = [
    { group: "Apps", items: [
      { name: "Boarda Browser - Web", checks: ["browser-web"], sub: "app.boarda.io" },
      { name: "Boarda Browser - iOS", checks: ["api-gateway"], sub: NATIVE },
      { name: "Boarda Browser - Android", checks: ["api-gateway"], sub: NATIVE }
    ] },
    { group: "Studio and business tools", items: [
      { name: "Boarda Studio", checks: ["studio"], sub: "console.boarda.io" },
      { name: "Boarda Business", checks: ["studio"], sub: "console.boarda.io/business" },
      { name: "Boarda Creators", checks: ["studio"], sub: "console.boarda.io/creators" },
      { name: "Boarda Workspace - Web", checks: ["studio"], sub: "console.boarda.io/workspace" },
      { name: "Boarda Workspace - Android", checks: ["api-gateway"], sub: NATIVE },
      { name: "Boarda Ads", checks: ["ads"], sub: "ads.boarda.io" },
      { name: "Boarda Cast", checks: ["cast"], sub: "cast.boarda.io" },
      { name: "Boarda Pages", checks: ["pages"], sub: "pages.boarda.io" }
    ] },
    { group: "Public pages and help", items: [
      { name: "Boarda Space pages", checks: ["spaces"], sub: "spaces.boarda.io" },
      { name: "Boarda Community", checks: ["community"], sub: "community.boarda.io" },
      { name: "Boarda Help Center", checks: ["help"], sub: "help.boarda.io" },
      { name: "Boarda Support", checks: ["support"], sub: "support.boarda.io" },
      { name: "Boarda website", checks: ["website"], sub: "boarda.io" }
    ] },
    { group: "Platform", items: [
      { name: "Boarda API", checks: ["api-gateway"], sub: "api.boarda.io" },
      { name: "Boarda Account and sign-in", checks: ["account"], sub: "account.boarda.io" },
      // Boarda short links (boarda.to, check "short-links") is added once the gateway serves
      // boarda.to/_health in production (BRDSPRINT-470); until then that path is read as a link.
      { name: "Boarda MCP", checks: ["mcp"], sub: "mcp.boarda.io" },
      { name: "Boarda Developers", checks: ["developers"], sub: "developers.boarda.io" }
    ] }
  ];

  // How an incident on a check is named in the incident lists.
  var CHECK_LABEL = {
    "browser-web": "Boarda Browser - Web",
    "api-gateway": "Boarda API",
    studio: "Boarda Studio (with Business, Creators and Workspace)",
    ads: "Boarda Ads",
    cast: "Boarda Cast",
    pages: "Boarda Pages",
    spaces: "Boarda Space pages",
    community: "Boarda Community",
    help: "Boarda Help Center",
    support: "Boarda Support",
    website: "Boarda website",
    account: "Boarda Account and sign-in",
    "short-links": "Boarda short links",
    mcp: "Boarda MCP",
    developers: "Boarda Developers"
  };

  var CHECKS = [];
  CATALOG.forEach(function (g) {
    g.items.forEach(function (it) {
      it.id = it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      it.checks.forEach(function (c) { if (CHECKS.indexOf(c) === -1) CHECKS.push(c); });
    });
  });
  var RANK = { none: 0, ok: 1, maint: 2, minor: 3, major: 4 };

  var STATE_LABEL = {
    ok: "Operational",
    minor: "Degraded performance",
    major: "Outage",
    maint: "Maintenance",
    none: "No data"
  };

  var ICONS = {
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    minor: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>',
    major: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    maint: '<svg viewBox="0 0 24 24"><path d="M12 7v5l3 2"/></svg>',
    error: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>',
    loading: ""
  };

  /* ---------- theme ---------- */

  function storedTheme() {
    try {
      var t = localStorage.getItem(THEME_KEY);
      return t === "light" || t === "dark" ? t : "system";
    } catch (e) {
      return "system";
    }
  }

  function applyTheme(t) {
    var html = document.documentElement;
    if (t === "system") html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", t);
    each(document.querySelectorAll("[data-theme-choice]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-choice") === t));
    });
  }

  each(document.querySelectorAll("[data-theme-choice]"), function (b) {
    b.addEventListener("click", function () {
      var t = b.getAttribute("data-theme-choice");
      try {
        if (t === "system") localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, t);
      } catch (e) {}
      applyTheme(t);
    });
  });
  applyTheme(storedTheme());

  /* ---------- helpers ---------- */

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fetchWithTimeout(url, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 12000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error(url + " answered " + r.status);
      return r;
    });
  }
  function getJSON(url) { return fetchWithTimeout(url).then(function (r) { return r.json(); }); }
  function getText(url) { return fetchWithTimeout(url).then(function (r) { return r.text(); }); }

  // history/<slug>.yml is flat "key: value" lines.
  function parseYml(text) {
    var out = {};
    String(text).split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^([A-Za-z]+):\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    });
    return out;
  }

  function utcDayStart(ms) {
    var d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  function dayKey(ms) { return new Date(ms).toISOString().slice(0, 10); }

  var fmtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  var fmtDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  var fmtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  var fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

  function fmtDateTime(ms) { return fmtDate.format(ms) + ", " + fmtTime.format(ms); }

  function sameLocalDay(a, b) {
    var x = new Date(a), y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }

  function fmtRange(start, end) {
    if (sameLocalDay(start, end)) {
      return fmtDate.format(start) + ", " + fmtTime.format(start).replace(/\s\S+$/, "") + " to " + fmtTime.format(end);
    }
    return fmtDateTime(start) + " to " + fmtDateTime(end);
  }

  function fmtDuration(minutes) {
    var m = Math.max(1, Math.round(minutes));
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60), rest = m % 60;
    if (h < 24) return h + " h" + (rest ? " " + rest + " min" : "");
    var d = Math.floor(h / 24), hr = h % 24;
    return d + (d === 1 ? " day" : " days") + (hr ? " " + hr + " h" : "");
  }

  function fmtAgo(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return "just now";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 48) return h + (h === 1 ? " hour ago" : " hours ago");
    return fmtDate.format(ms);
  }

  function fmtPct(p) {
    if (p >= 100) return "100%";
    return (Math.floor(p * 100) / 100).toFixed(2) + "%";
  }

  function displayName(name) { return String(name || "").replace(/^Boarda\s+/i, ""); }

  function hostOf(url) {
    try { return new URL(url).host; } catch (e) { return ""; }
  }

  // Strip emoji and symbol glyphs that Upptime puts in titles (we never show emoji).
  function cleanTitle(t) {
    return String(t || "")
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Issue body to plain text: drop HTML comments, markdown links, emphasis and code ticks.
  function plainBody(body) {
    return String(body || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]{1,3}([^*_`]+)[*_`]{1,3}/g, "$1")
      .replace(/^#+\s*/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function labelsOf(issue) { return (issue.labels || []).map(function (l) { return typeof l === "string" ? l : l.name; }); }

  // Upptime's automatic incidents say "... was **down**" or "... was **degraded**" in the body.
  function autoKind(issue) {
    var m = String(issue.body || "").match(/was \*\*(down|degraded)\*\*/i);
    return m ? m[1].toLowerCase() : null;
  }

  function maintWindow(issue) {
    var body = String(issue.body || "");
    var s = body.match(/<!--\s*start:\s*([^>]+?)\s*-->/i);
    var e = body.match(/<!--\s*end:\s*([^>]+?)\s*-->/i);
    var down = body.match(/<!--\s*expectedDown:\s*([^>]+?)\s*-->/i);
    var start = s ? Date.parse(s[1]) : NaN;
    var end = e ? Date.parse(e[1]) : NaN;
    return {
      start: isNaN(start) ? null : start,
      end: isNaN(end) ? null : end,
      slugs: down ? down[1].split(",").map(function (x) { return x.trim(); }) : []
    };
  }

  /* ---------- data ---------- */

  function load() {
    var started = Date.now();
    var soft = function (p) { return p.then(function (x) { return x; }, function () { return null; }); };
    return Promise.all([
      soft(getJSON(RAW + "/history/summary.json")),
      Promise.all(CHECKS.map(function (slug) {
        return soft(getText(RAW + "/history/" + encodeURIComponent(slug) + ".yml").then(parseYml));
      })),
      soft(getJSON(API + "/issues?state=all&per_page=100&sort=created&direction=desc")),
      soft(getJSON(API + "/actions/workflows/uptime.yml/runs?per_page=1&status=completed"))
    ]).then(function (r) {
      lastLoad = started;
      var summary = r[0] || [], ymls = r[1];
      if (!summary.length && !ymls.some(Boolean)) throw new Error("no status data");
      render(build(summary, ymls, r[2], r[3]));
    }).catch(function () {
      lastLoad = started;
      renderError();
    });
  }

  function build(summaryList, ymls, issues, runs) {
    var now = Date.now();
    var slugs = CHECKS;
    var bySlug = {};
    summaryList.forEach(function (s) { bySlug[s.slug] = s; });
    var summary = CHECKS.map(function (slug) { return bySlug[slug] || { slug: slug, name: CHECK_LABEL[slug] || slug }; });
    var all = (issues || []).filter(function (i) { return !i.pull_request; });
    var incidents = all.filter(function (i) { return labelsOf(i).indexOf("status") !== -1; });
    var maint = all.filter(function (i) { return i.state === "open" && labelsOf(i).indexOf("maintenance") !== -1; })
      .map(function (i) { return { issue: i, win: maintWindow(i) }; })
      .filter(function (m) { return !m.win.end || m.win.end > now; });

    incidents.forEach(function (i) {
      i._slugs = labelsOf(i).filter(function (l) { return slugs.indexOf(l) !== -1; });
      i._kind = autoKind(i);
      i._start = Date.parse(i.created_at);
      i._end = i.closed_at ? Date.parse(i.closed_at) : null;
    });

    var todayStart = utcDayStart(now);
    var services = summary.map(function (s, idx) {
      var yml = ymls[idx] || {};
      var own = incidents.filter(function (i) { return i._slugs.indexOf(s.slug) !== -1; });

      // Downtime per UTC day: the larger of Upptime's summary and what the incidents add up to
      // (the summary is rebuilt once a day, so incidents keep today and yesterday current).
      var fromIssues = {};
      own.forEach(function (i) {
        var t = i._start, end = i._end || now;
        while (t < end) {
          var next = utcDayStart(t) + DAY_MS, segEnd = Math.min(end, next), k = dayKey(t);
          fromIssues[k] = (fromIssues[k] || 0) + (segEnd - t) / 60000;
          t = segEnd;
        }
      });

      var startedAt = Date.parse(yml.startTime || "");
      var noData = !ymls[idx] && !bySlug[s.slug];
      // A check that has never run has no days of data; one without a start time counts them all.
      var firstDay = noData ? todayStart + DAY_MS : isNaN(startedAt) ? null : utcDayStart(startedAt);
      var dmd = s.dailyMinutesDown || {};
      var days = [], downTotal = 0, minutesTotal = 0, badDays = 0;
      for (var i = DAYS - 1; i >= 0; i--) {
        var ds = todayStart - i * DAY_MS, k = dayKey(ds);
        if (firstDay !== null && ds < firstDay) { days.push({ ms: ds, key: k, state: "none", down: 0 }); continue; }
        var span = i === 0 ? Math.max(1, (now - todayStart) / 60000) : 1440;
        var down = Math.min(span, Math.max(Number(dmd[k]) || 0, fromIssues[k] || 0));
        downTotal += down; minutesTotal += span;
        if (down > 0) badDays++;
        days.push({ ms: ds, key: k, state: down <= 0 ? "ok" : down < 60 ? "minor" : "major", down: down });
      }

      var open = own.filter(function (x) { return x.state === "open"; });
      var inMaint = maint.some(function (m) {
        return m.win.slugs.indexOf(s.slug) !== -1 && m.win.start && m.win.start <= now;
      });
      var state = noData ? "none" : "ok";
      if (yml.status === "degraded" || s.status === "degraded") state = "minor";
      if (open.some(function (x) { return x._kind !== "down"; })) state = "minor";
      if (yml.status === "down" || open.some(function (x) { return x._kind === "down"; })) state = "major";
      if (inMaint) state = "maint";

      return {
        slug: s.slug,
        name: displayName(s.name),
        host: hostOf(s.url),
        state: state,
        days: days,
        uptime: minutesTotal ? 100 * (1 - downTotal / minutesTotal) : null,
        badDays: badDays,
        incidents: own,
        lastUpdated: Date.parse(yml.lastUpdated || "") || null
      };
    });

    var lastRun = runs && runs.workflow_runs && runs.workflow_runs[0] ? Date.parse(runs.workflow_runs[0].updated_at) : null;
    var lastYml = Math.max.apply(null, services.map(function (s) { return s.lastUpdated || 0; }));

    // Rows: each catalogue item takes the worst of its checks, day by day.
    var checkBy = {};
    services.forEach(function (s) { checkBy[s.slug] = s; });
    var rows = [];
    CATALOG.forEach(function (g) {
      g.items.forEach(function (it) {
        var cs = it.checks.map(function (c) { return checkBy[c]; }).filter(Boolean);
        var state = "none";
        cs.forEach(function (c) { if (RANK[c.state] > RANK[state]) state = c.state; });
        var days = [], badDays = 0;
        for (var d = 0; d < DAYS; d++) {
          var pick = null;
          cs.forEach(function (c) {
            var x = c.days[d];
            if (!pick || (x.state !== "none" && (pick.state === "none" || x.down > pick.down))) pick = x;
          });
          days.push(pick);
          if (pick && pick.down > 0) badDays++;
        }
        var ups = cs.map(function (c) { return c.uptime; }).filter(function (u) { return u != null; });
        var incs = [];
        cs.forEach(function (c) { c.incidents.forEach(function (i) { if (incs.indexOf(i) === -1) incs.push(i); }); });
        rows.push({
          id: it.id, name: it.name, sub: it.sub, group: g.group, native: it.sub === NATIVE,
          state: state, days: days, badDays: badDays, incidents: incs,
          uptime: ups.length ? Math.min.apply(null, ups) : null
        });
      });
    });

    return {
      now: now,
      rows: rows,
      services: services,
      incidents: incidents,
      maint: maint,
      issuesOk: issues !== null,
      lastChecked: lastRun || (lastYml > 0 ? lastYml : null)
    };
  }

  /* ---------- render ---------- */

  var lastLoad = 0;
  var current = null;

  function names(list) {
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + " and " + list[1];
    return list.slice(0, -1).join(", ") + " and " + list[list.length - 1];
  }

  function setBanner(state, title, meta) {
    var b = document.getElementById("banner");
    b.setAttribute("data-state", state);
    b.querySelector(".banner-icon").innerHTML = ICONS[state] || "";
    document.getElementById("banner-title").textContent = title;
    var m = document.getElementById("banner-meta");
    m.textContent = meta || "";
  }

  function checkNames(slugs) {
    return slugs.length ? names(slugs.map(function (s) { return CHECK_LABEL[s] || s; })) : "A service";
  }

  function incidentTitle(i, _unused, ongoing) {
    var who = checkNames(i._slugs);
    if (i._kind === "down") return who + (ongoing ? " is not responding" : " was not responding");
    if (i._kind === "degraded") return who + (ongoing ? " is responding slowly" : " was responding slowly");
    return cleanTitle(i.title) || who + " incident";
  }

  function render(data) {
    current = data;

    // Banner: counted by what customers see, the rows.
    var major = data.rows.filter(function (s) { return s.state === "major"; });
    var minor = data.rows.filter(function (s) { return s.state === "minor"; });
    var maintNow = data.maint.some(function (m) { return m.win.start && m.win.start <= data.now; });
    var meta = data.lastChecked
      ? "Last checked " + fmtAgo(data.lastChecked) + ". This page updates on its own."
      : "This page updates on its own.";
    var who = function (list) {
      return list.length > 3 ? list.length + " services are" : names(list.map(function (s) { return s.name; })) + (list.length === 1 ? " is" : " are");
    };
    if (major.length && major.length === data.rows.length) {
      setBanner("major", "Major outage across Boarda", meta);
    } else if (major.length) {
      setBanner("major", who(major) + " having an outage", meta);
    } else if (minor.length) {
      setBanner("minor", who(minor) + " having issues", meta);
    } else if (maintNow) {
      setBanner("maint", "Scheduled maintenance in progress", meta);
    } else {
      setBanner("ok", "All systems operational", meta);
    }
    if (data.lastChecked) document.getElementById("banner-meta").title = fmtDateTime(data.lastChecked);

    renderActive(data);
    renderServices(data);
    renderHistory(data);
    focusHash();
  }

  function renderActive(data) {
    var box = document.getElementById("active");
    box.textContent = "";
    var open = data.incidents.filter(function (i) { return i.state === "open"; });

    open.forEach(function (i) {
      var n = el("article", "notice" + (i._kind === "down" ? "" : " minor"));
      n.appendChild(el("p", "notice-kicker", i._kind === "degraded" ? "Degraded performance" : "Ongoing incident"));
      n.appendChild(el("h3", null, incidentTitle(i, null, true)));
      n.appendChild(el("p", "muted", "Started " + fmtDateTime(i._start) + " (" + fmtAgo(i._start) + ")."));
      var affected = data.rows.filter(function (r) { return r.incidents.indexOf(i) !== -1; });
      if (affected.length > 1) n.appendChild(el("p", "muted", "Affects " + names(affected.map(function (r) { return r.name; })) + "."));
      if (i._kind) {
        n.appendChild(el("p", null, "Our monitoring detected this automatically. This page marks it resolved once our checks see the service recover."));
      } else {
        var body = plainBody(i.body);
        if (body) n.appendChild(el("p", "body", body));
        var p = el("p", "muted");
        var a = el("a", null, "Follow updates");
        a.href = i.html_url;
        p.appendChild(a);
        n.appendChild(p);
      }
      box.appendChild(n);
    });

    data.maint.forEach(function (m) {
      var running = m.win.start && m.win.start <= data.now;
      var n = el("article", "notice maint");
      n.appendChild(el("p", "notice-kicker", running ? "Maintenance in progress" : "Scheduled maintenance"));
      n.appendChild(el("h3", null, cleanTitle(m.issue.title)));
      if (m.win.start && m.win.end) n.appendChild(el("p", "muted", fmtRange(m.win.start, m.win.end)));
      else if (m.win.start) n.appendChild(el("p", "muted", "From " + fmtDateTime(m.win.start)));
      var body = plainBody(m.issue.body);
      if (body) n.appendChild(el("p", "body", body));
      box.appendChild(n);
    });

    box.hidden = !box.children.length;
  }

  // One group: the worst of its rows, day by day.
  function groupSummary(name, rows) {
    var state = "none", days = [], badDays = 0, incs = [];
    rows.forEach(function (r) {
      if (RANK[r.state] > RANK[state]) state = r.state;
      r.incidents.forEach(function (i) { if (incs.indexOf(i) === -1) incs.push(i); });
    });
    for (var d = 0; d < DAYS; d++) {
      var pick = null;
      rows.forEach(function (r) {
        var x = r.days[d];
        if (!pick || (x.state !== "none" && (pick.state === "none" || x.down > pick.down))) pick = x;
      });
      days.push(pick);
      if (pick.down > 0) badDays++;
    }
    var ups = rows.map(function (r) { return r.uptime; }).filter(function (u) { return u != null; });
    return {
      id: "group-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: name, sub: rows.length + (rows.length === 1 ? " service" : " services"),
      state: state, days: days, badDays: badDays, incidents: incs,
      uptime: ups.length ? Math.min.apply(null, ups) : null
    };
  }

  function renderServices(data) {
    var box = document.getElementById("services");
    var frag = document.createDocumentFragment();
    var lookup = {};
    var wasOpen = {};
    each(box.querySelectorAll("details.grp"), function (d) { wasOpen[d.getAttribute("data-group")] = d.open; });

    CATALOG.forEach(function (g) {
      var rows = data.rows.filter(function (r) { return r.group === g.group; });
      if (!rows.length) return;
      var sum = groupSummary(g.group, rows);
      lookup[sum.id] = sum;

      var det = el("details", "grp");
      det.setAttribute("data-group", g.group);
      det.open = g.group in wasOpen ? wasOpen[g.group] : (sum.state !== "ok" && sum.state !== "none");
      var summary = el("summary", "svc grp-sum");
      fillRow(summary, sum, true);
      det.appendChild(summary);

      var items = el("div", "grp-items");
      rows.forEach(function (r) {
        lookup[r.id] = r;
        var row = el("div", "svc");
        row.id = r.id;
        fillRow(row, r, false);
        items.appendChild(row);
      });
      det.appendChild(items);
      frag.appendChild(det);
    });

    data.lookup = lookup;
    box.textContent = "";
    box.appendChild(frag);
  }

  function fillRow(row, s, isGroup) {
    var top = el("div", "svc-row");
    var left = el("div", "svc-left");
    if (isGroup) {
      var chev = el("span", "chev");
      chev.setAttribute("aria-hidden", "true");
      chev.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
      left.appendChild(chev);
    }
    left.appendChild(el("span", "svc-name", s.name));
    if (s.sub) left.appendChild(el("span", isGroup || s.native ? "svc-note" : "svc-host", s.sub));
    top.appendChild(left);
    top.appendChild(el("span", "svc-state " + s.state, STATE_LABEL[s.state]));
    row.appendChild(top);

    var bars = el("div", "bars");
    bars.setAttribute("data-key", s.id);
    bars.setAttribute("role", "img");
    bars.setAttribute("aria-label", s.name + ": " + (s.uptime == null ? "no data yet" : fmtPct(s.uptime) + " uptime over 90 days") +
      (s.uptime == null ? "" : s.badDays ? ", downtime on " + s.badDays + (s.badDays === 1 ? " day" : " days") : ", no downtime"));
    s.days.forEach(function (d, idx) {
      var b = el("span", "bar " + d.state);
      b.setAttribute("data-i", String(idx));
      bars.appendChild(b);
    });
    row.appendChild(bars);

    var axis = el("div", "axis");
    var ago = el("span");
    ago.innerHTML = '<span class="range-90">90 days ago</span><span class="range-60">60 days ago</span><span class="range-30">30 days ago</span>';
    axis.appendChild(ago);
    axis.appendChild(el("span", "line"));
    axis.appendChild(el("span", "pct", s.uptime == null ? "Checks just started" : fmtPct(s.uptime) + " uptime"));
    axis.appendChild(el("span", "line"));
    axis.appendChild(el("span", null, "Today"));
    row.appendChild(axis);
  }

  function renderHistory(data) {
    var box = document.getElementById("history");
    box.textContent = "";

    if (!data.issuesOk) {
      var p = el("p", "muted empty", "Incident history could not be loaded right now. ");
      var a = el("a", null, "See the full log on GitHub");
      a.href = ISSUES_URL;
      p.appendChild(a);
      box.appendChild(p);
      return;
    }

    var past = data.incidents.filter(function (i) { return i.state !== "open"; })
      .sort(function (a, b) { return b._start - a._start; });
    if (!past.length) {
      box.appendChild(el("p", "muted empty", "No incidents reported."));
      return;
    }

    var list = el("div");
    var lastMonth = null, section = null;
    past.forEach(function (i, idx) {
      var month = fmtMonth.format(i._start);
      if (month !== lastMonth) {
        section = el("div", "month");
        section.appendChild(el("h3", null, month));
        if (idx >= HISTORY_LIMIT) section.setAttribute("data-older", "");
        list.appendChild(section);
        lastMonth = month;
      }
      var item = el("article", "inc");
      if (idx >= HISTORY_LIMIT) item.setAttribute("data-older", "");
      var top = el("div", "inc-top");
      top.appendChild(el("span", "inc-title", incidentTitle(i, null, false)));
      top.appendChild(el("span", "chip", "Resolved"));
      item.appendChild(top);
      var end = i._end || i._start;
      item.appendChild(el("p", "inc-meta muted", fmtRange(i._start, end) + ". Lasted " + fmtDuration((end - i._start) / 60000) + "."));
      if (!i._kind) {
        var body = plainBody(i.body);
        if (body) item.appendChild(el("p", "body", body.length > 600 ? body.slice(0, 600).trim() + "..." : body));
      }
      section.appendChild(item);
    });
    box.appendChild(list);

    var older = list.querySelectorAll("[data-older]");
    var more = el("p", "more");
    if (older.length) {
      each(older, function (n) { n.hidden = true; });
      var btn = el("a", null, "Show older incidents");
      btn.href = "#history-title";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        each(older, function (n) { n.hidden = false; });
        btn.remove();
      });
      more.appendChild(btn);
      more.appendChild(document.createTextNode(" · "));
    }
    var gh = el("a", null, "Full incident log on GitHub");
    gh.href = ISSUES_URL;
    more.appendChild(gh);
    box.appendChild(more);
  }

  function renderError() {
    setBanner("error", "Status is unavailable right now", "We could not load the latest checks. Retrying in a few minutes.");
    var box = document.getElementById("services");
    if (box.querySelector(".skeleton")) {
      box.textContent = "";
      box.appendChild(el("p", "muted svc", "Service status could not be loaded."));
    }
    var h = document.getElementById("history");
    if (h.textContent.indexOf("Loading") === 0) h.textContent = "";
  }

  // Old Upptime links (/history/<check>) arrive as #<check>; send them to the first row on that check.
  var HASH_ALIAS = {};
  CATALOG.forEach(function (g) {
    g.items.forEach(function (it) {
      it.checks.forEach(function (c) { if (!HASH_ALIAS[c]) HASH_ALIAS[c] = it.id; });
    });
  });
  HASH_ALIAS.studio = "boarda-studio";

  function focusHash() {
    var slug = decodeURIComponent(location.hash.slice(1));
    slug = HASH_ALIAS[slug] || slug;
    if (!slug || focusHash.done === slug) return;
    var row = document.getElementById(slug);
    if (!row || !row.classList.contains("svc")) return;
    focusHash.done = slug;
    var det = row.closest("details");
    if (det) det.open = true;
    row.scrollIntoView({ block: "center" });
    row.classList.add("flash");
  }
  window.addEventListener("hashchange", function () { focusHash.done = null; focusHash(); });

  /* ---------- tooltip ---------- */

  var tip = document.getElementById("tip");
  var activeBar = null;

  function showTip(bar) {
    if (!current) return;
    var svc = current.lookup && current.lookup[bar.parentNode.getAttribute("data-key")];
    if (!svc) return;
    var d = svc.days[Number(bar.getAttribute("data-i"))];
    if (!d) return;

    if (activeBar) activeBar.classList.remove("on");
    activeBar = bar;
    bar.classList.add("on");

    tip.textContent = "";
    tip.appendChild(el("strong", null, fmtDay.format(d.ms)));
    var line = d.state === "none" ? "No data recorded"
      : d.down <= 0 ? "No downtime recorded"
      : "Down for " + fmtDuration(d.down);
    tip.appendChild(document.createTextNode(line));

    var dayEnd = d.ms + DAY_MS;
    var hits = svc.incidents.filter(function (i) { return i._start < dayEnd && (i._end || current.now) > d.ms; });
    if (hits.length) {
      var ul = el("ul");
      hits.slice(0, 3).forEach(function (i) {
        ul.appendChild(el("li", null, incidentTitle(i, null, i.state === "open")));
      });
      tip.appendChild(ul);
    }

    tip.hidden = false;
    var r = bar.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
    var top = r.top - th - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function hideTip() {
    tip.hidden = true;
    if (activeBar) activeBar.classList.remove("on");
    activeBar = null;
  }

  var servicesBox = document.getElementById("services");
  servicesBox.addEventListener("pointerover", function (e) {
    if (e.target.classList && e.target.classList.contains("bar")) showTip(e.target);
  });
  servicesBox.addEventListener("pointerdown", function (e) {
    if (e.target.classList && e.target.classList.contains("bar")) showTip(e.target);
  });
  servicesBox.addEventListener("click", function (e) {
    if (e.target.classList && e.target.classList.contains("bar") && e.target.closest("summary")) e.preventDefault();
  });
  servicesBox.addEventListener("pointerleave", function (e) {
    if (e.pointerType === "mouse") hideTip();
  });
  document.addEventListener("pointerdown", function (e) {
    if (!(e.target.classList && e.target.classList.contains("bar"))) hideTip();
  });
  window.addEventListener("scroll", hideTip, { passive: true });

  /* ---------- start ---------- */

  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());

  load();
  setInterval(function () {
    if (document.visibilityState === "visible") load();
  }, REFRESH_MS);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - lastLoad > REFRESH_MS) load();
  });
})();
