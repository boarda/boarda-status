// Atom feed of incidents and maintenance for status.boarda.io/feed.xml (BRDSPRINT-472).
// Reads the GitHub issues Upptime opens (label "status") and maintenance issues (label
// "maintenance"), names services from .upptimerc.yml and prints the feed to stdout.
// Run by .github/workflows/status-feed.yml; locally: GH_TOKEN=... node scripts/build-feed.mjs
import { readFileSync } from "node:fs";

const REPO = process.env.GITHUB_REPOSITORY || "boarda/boarda-status";
const SITE = "https://status.boarda.io";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

// slug -> display name, from the Upptime config ("name:" comes before "slug:" in each site).
const names = {};
let pendingName = null;
for (const line of readFileSync(new URL("../.upptimerc.yml", import.meta.url), "utf8").split("\n")) {
  const n = line.match(/^\s*-\s*name:\s*(.+?)\s*$/);
  if (n) { pendingName = n[1]; continue; }
  const s = line.match(/^\s*slug:\s*(\S+)\s*$/);
  if (s && pendingName) { names[s[1]] = pendingName; pendingName = null; }
}
// Sites without an explicit slug: Upptime derives it from the name; ours all set one.

const res = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100&sort=created&direction=desc`, {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "boarda-status-feed", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
});
if (!res.ok) throw new Error(`GitHub issues answered ${res.status}`);
const issues = (await res.json()).filter((i) => !i.pull_request);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (t) => String(t || "").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
const plain = (b) => String(b || "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/[*_`]{1,3}([^*_`]+)[*_`]{1,3}/g, "$1")
  .trim();
const fmt = (ms) => new Date(ms).toUTCString().replace(" GMT", " UTC");
const dur = (min) => {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "day" : "days"}${h % 24 ? ` ${h % 24} h` : ""}`;
};

const entries = [];
for (const i of issues) {
  const labels = i.labels.map((l) => (typeof l === "string" ? l : l.name));
  const isIncident = labels.includes("status");
  const isMaint = labels.includes("maintenance");
  if (!isIncident && !isMaint) continue;

  const who = labels.filter((l) => names[l]).map((l) => names[l]).join(", ") || "A Boarda service";
  const kind = (String(i.body || "").match(/was \*\*(down|degraded)\*\*/i) || [])[1]?.toLowerCase();
  const start = Date.parse(i.created_at);
  const end = i.closed_at ? Date.parse(i.closed_at) : null;
  const add = (suffix, title, text, at) => entries.push({
    id: `${SITE}/incidents/${i.number}/${suffix}`, title, text,
    updated: new Date(at).toISOString(), published: new Date(at).toISOString(),
  });

  if (isMaint) {
    const s = (i.body || "").match(/<!--\s*start:\s*([^>]+?)\s*-->/i);
    const e = (i.body || "").match(/<!--\s*end:\s*([^>]+?)\s*-->/i);
    const win = s && e ? `Window: ${fmt(Date.parse(s[1]))} to ${fmt(Date.parse(e[1]))}.` : "";
    add("scheduled", `Scheduled maintenance: ${clean(i.title)}`, [win, plain(i.body)].filter(Boolean).join("\n\n"), start);
    if (end) add("completed", `Maintenance completed: ${clean(i.title)}`, `Completed ${fmt(end)}.`, end);
  } else if (kind) {
    const now = kind === "down" ? "is not responding" : "is responding slowly";
    const was = kind === "down" ? "was not responding" : "was responding slowly";
    add("started", `Investigating: ${who} ${now}`, `Our monitoring detected this at ${fmt(start)}. Status page: ${SITE}`, start);
    if (end) add("resolved", `Resolved: ${who} ${was}`, `From ${fmt(start)} to ${fmt(end)}, lasting ${dur((end - start) / 60000)}. Status page: ${SITE}`, end);
  } else {
    add("started", `Incident: ${clean(i.title)}`, [`Started ${fmt(start)}.`, plain(i.body)].filter(Boolean).join("\n\n"), start);
    if (end) add("resolved", `Resolved: ${clean(i.title)}`, `Resolved ${fmt(end)}.`, end);
  }
}

entries.sort((a, b) => (a.updated < b.updated ? 1 : -1));
const updated = entries[0]?.updated || new Date().toISOString();

process.stdout.write(`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Boarda Status</title>
  <subtitle>Incidents and scheduled maintenance for Boarda products</subtitle>
  <id>${SITE}/</id>
  <link rel="alternate" type="text/html" href="${SITE}/"/>
  <link rel="self" type="application/atom+xml" href="${SITE}/feed.xml"/>
  <icon>${SITE}/icons/boarda-favicon-blue-96.png</icon>
  <updated>${updated}</updated>
  <author><name>Boarda</name><uri>https://boarda.io</uri></author>
${entries.slice(0, 50).map((e) => `  <entry>
    <id>${esc(e.id)}</id>
    <title>${esc(e.title)}</title>
    <link rel="alternate" type="text/html" href="${SITE}/"/>
    <published>${e.published}</published>
    <updated>${e.updated}</updated>
    <content type="text">${esc(e.text)}</content>
  </entry>`).join("\n")}
</feed>
`);
