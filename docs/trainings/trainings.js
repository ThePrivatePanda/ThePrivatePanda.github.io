/*
 * CMC training sign-ups -- the block for the club website.
 *
 * Put this where the sign-ups should appear:
 *
 *   <div id="cmc-trainings"
 *        data-endpoint="https://script.google.com/macros/s/XXXX/exec"></div>
 *   <script src="trainings.js" defer></script>
 *
 * data-endpoint is the Apps Script web app URL (trainings/README.md, step 4).
 * Restyle by overriding the --cmct-* variables on #cmc-trainings.
 *
 * The POST is sent as text/plain on purpose: Apps Script web apps do not
 * answer the CORS preflight a JSON content type would trigger, so a
 * "simple" request is the only kind a browser will deliver to them.
 */
(function () {
  "use strict";
  var root = document.getElementById("cmc-trainings");
  if (!root) return;
  var endpoint = root.getAttribute("data-endpoint") || "";
  var NETID = /^[a-z]{2,4}[0-9]{1,6}$/;
  var CUID = /^[0-9]{7}$/;
  var messages = {};      // session id -> {ok, text}
  var sessions = [];
  var busy = {};

  var css = [
    "#cmc-trainings{--cmct-ink:inherit;--cmct-muted:#5d665f;--cmct-line:#d3d7d0;--cmct-card:transparent;",
    "--cmct-full:rgba(127,127,127,.08);--cmct-accent:#b3471d;--cmct-accent-ink:#fff;--cmct-ok:#2f7a4a;",
    "--cmct-ok-bg:rgba(47,122,74,.12);--cmct-bad:#b42a2a;--cmct-bad-bg:rgba(180,42,42,.1);",
    "--cmct-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;display:grid;gap:18px;color:var(--cmct-ink)}",
    "#cmc-trainings *{box-sizing:border-box}",
    ".cmct-day{display:grid;gap:8px}",
    ".cmct-daylabel{font:600 12px var(--cmct-mono);text-transform:uppercase;letter-spacing:.08em;color:var(--cmct-muted)}",
    ".cmct-s{border:1px solid var(--cmct-line);border-radius:6px;padding:14px;display:grid;gap:10px;background:var(--cmct-card)}",
    ".cmct-s.full{background:var(--cmct-full)}",
    ".cmct-top{display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap}",
    ".cmct-name{font-weight:700;font-size:1.05em}",
    ".cmct-meta,.cmct-notes{color:var(--cmct-muted);font-size:.9em}",
    ".cmct-spots{font:600 13px var(--cmct-mono);font-variant-numeric:tabular-nums;white-space:nowrap}",
    ".cmct-s.full .cmct-spots{color:var(--cmct-bad)}",
    ".cmct-form{display:flex;gap:8px;flex-wrap:wrap}",
    ".cmct-form input[name=name]{flex:2 1 180px}",
    ".cmct-form input{flex:1 1 110px;min-width:0;font:15px var(--cmct-mono);padding:9px 11px;border:1px solid var(--cmct-line);border-radius:4px;background:transparent;color:inherit}",
    ".cmct-form button{font-family:inherit;font-weight:600;font-size:14px;border:0;border-radius:4px;padding:9px 16px;cursor:pointer;background:var(--cmct-accent);color:var(--cmct-accent-ink)}",
    ".cmct-form button:disabled{opacity:.45;cursor:not-allowed}",
    ".cmct-form input:focus-visible,.cmct-form button:focus-visible{outline:2px solid var(--cmct-accent);outline-offset:2px}",
    ".cmct-msg{font-size:.9em;padding:8px 10px;border-radius:4px}",
    ".cmct-msg.ok{background:var(--cmct-ok-bg);color:var(--cmct-ok)}",
    ".cmct-msg.bad{background:var(--cmct-bad-bg);color:var(--cmct-bad)}",
    ".cmct-empty{color:var(--cmct-muted)}"
  ].join("");
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function say(text) { root.innerHTML = '<p class="cmct-empty">' + esc(text) + "</p>"; }

  function draw() {
    // Keep whatever people have typed in other sessions' boxes: a redraw after
    // one sign-up must not wipe a half-typed form somewhere else.
    var typed = {};
    Array.prototype.forEach.call(root.querySelectorAll("form[data-s] input"), function (i) {
      if (i.value) typed[i.id] = i.value;
    });
    if (!sessions.length) { say("No trainings are scheduled right now. Check back soon."); return; }
    var days = [];
    sessions.forEach(function (s) { if (days.indexOf(s.day) < 0) days.push(s.day); });
    root.innerHTML = days.map(function (day) {
      return '<div class="cmct-day"><div class="cmct-daylabel">' + esc(day) + "</div>" +
        sessions.filter(function (s) { return s.day === day; }).map(card).join("") + "</div>";
    }).join("");
    Array.prototype.forEach.call(root.querySelectorAll("form[data-s]"), function (f) {
      f.addEventListener("submit", function (e) { e.preventDefault(); signUp(f.getAttribute("data-s"), f); });
      Array.prototype.forEach.call(f.querySelectorAll("input"), function (i) {
        if (typed[i.id] && !i.disabled) i.value = typed[i.id];
      });
    });
  }

  function card(s) {
    var full = s.left <= 0, m = messages[s.id], b = busy[s.id];
    var meta = [s.time, s.where, s.trainer ? "run by " + s.trainer : ""].filter(Boolean).join(" · ");
    return '<div class="cmct-s' + (full ? " full" : "") + '">' +
      '<div class="cmct-top"><div><div class="cmct-name">' + esc(s.type) + "</div>" +
      '<div class="cmct-meta">' + esc(meta) + "</div>" +
      (s.notes ? '<div class="cmct-notes">' + esc(s.notes) + "</div>" : "") + "</div>" +
      '<div class="cmct-spots">' + (full ? "Full" : esc(s.left) + " of " + esc(s.spots) + " open") + "</div></div>" +
      '<form class="cmct-form" data-s="' + esc(s.id) + '">' +
      field(s, "name", "Your name", "Full name", "name", "", full || b) +
      field(s, "netid", "Your NetID", "NetID", "off", ' autocapitalize="off" spellcheck="false"', full || b) +
      field(s, "cuid", "Your CUID (7 digits on your Cornell ID)", "CUID", "off", ' inputmode="numeric" maxlength="7"', full || b) +
      '<button type="submit"' + (full || b ? " disabled" : "") + ">" + (b ? "Signing up…" : full ? "Full" : "Sign up") + "</button></form>" +
      (m ? '<div class="cmct-msg ' + (m.ok ? "ok" : "bad") + '" role="status">' + esc(m.text) + "</div>" : "") +
      "</div>";
  }

  function field(s, key, label, placeholder, auto, extra, off) {
    return '<input name="' + key + '" id="cmct-' + key + "-" + esc(s.id) + '" aria-label="' + esc(label) + " for " +
      esc(s.type) + ", " + esc(s.day) + '" placeholder="' + esc(placeholder) + '" autocomplete="' + auto + '"' +
      extra + (off ? " disabled" : "") + ">";
  }

  function load() {
    if (!endpoint) { say("Sign-ups are not connected yet (no data-endpoint)."); return Promise.resolve(); }
    return fetch(endpoint, { method: "GET" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || "bad answer");
        sessions = d.sessions || [];
        draw();
      })
      .catch(function () { say("Couldn't load the training schedule. Reload the page to try again."); });
  }

  function signUp(id, form) {
    var v = function (k) { return String(form.querySelector("input[name=" + k + "]").value || "").trim(); };
    var entry = { name: v("name"), netid: v("netid").toLowerCase(), cuid: v("cuid").replace(/\s+/g, "") };
    // The script checks all of this too; checking here just saves a round trip.
    var problem = !entry.name ? "Enter your name." :
      !NETID.test(entry.netid) ? (entry.netid ? '"' + entry.netid.slice(0, 20) + "\" doesn't look like a NetID. It's letters then numbers, like ab123." : "Enter your NetID.") :
      !CUID.test(entry.cuid) ? "Your CUID is the 7-digit number on your Cornell ID card." : "";
    if (problem) { messages[id] = { ok: false, text: problem }; draw(); return; }
    busy[id] = true; delete messages[id];
    failed = entry; draw();
    fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                      body: JSON.stringify({ session: id, name: entry.name, netid: entry.netid, cuid: entry.cuid }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        messages[id] = d.ok ? { ok: true, text: d.message + " " + d.left + " spot" + (d.left === 1 ? "" : "s") + " left." }
                            : { ok: false, text: d.error || "That didn't work. Try again." };
        if (d.ok) failed = null;
      })
      .catch(function () {
        messages[id] = { ok: false, text: "Couldn't reach the sign-up sheet. Check your connection and try again." };
      })
      .then(function () {
        busy[id] = false;
        return load();
      })
      .then(function () { if (failed) restore(id, failed); failed = null; });
  }
  var failed = null;

  // After a refusal, put back what they typed so they only fix the one field.
  function restore(id, entry) {
    ["name", "netid", "cuid"].forEach(function (k) {
      var box = document.getElementById("cmct-" + k + "-" + id);
      if (box && !box.disabled) box.value = entry[k];
    });
  }

  say("Loading trainings…");
  load();
})();
