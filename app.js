"use strict";
// A fictional transaction graph: amounts in BTC, transaction IDs are made up for the demo.
const NODES = {
  S:  { x: 60,  y: 210, label: "seed",       kind: "seed" },
  A1: { x: 220, y: 55,  label: "a1" }, A2: { x: 220, y: 140, label: "a2" },
  A3: { x: 220, y: 290, label: "a3" }, A4: { x: 220, y: 370, label: "a4" },
  C1: { x: 340, y: 215, label: "c1",        kind: "chg" },
  N1: { x: 400, y: 40,  label: "n1" }, N2: { x: 420, y: 115, label: "n2" },
  N3: { x: 400, y: 300, label: "n3" }, CJ: { x: 400, y: 380, label: "coinjoin", kind: "cj" },
  P1: { x: 520, y: 125, label: "p1" }, C2: { x: 520, y: 235, label: "c2", kind: "chg" },
  P2: { x: 680, y: 135, label: "p2" }, C3: { x: 680, y: 255, label: "c3", kind: "chg" },
  X:  { x: 870, y: 255, label: "Exchange", kind: "svc" },
};
const EDGES = [
  ["S", "A1", 0.01, "3f9a1c"], ["S", "A2", 0.01, "3f9a1c"], ["S", "A3", 0.01, "3f9a1c"], ["S", "A4", 0.02, "3f9a1c"], ["S", "C1", 4.20, "3f9a1c"],
  ["A1", "N1", 0.01, "8be204"], ["A2", "N2", 0.01, "d1774e"], ["A3", "N3", 0.01, "52c0aa"], ["A4", "CJ", 0.02, "e09b31"],
  ["C1", "P1", 0.30, "7a4d90"], ["C1", "C2", 3.88, "7a4d90"],
  ["C2", "P2", 0.25, "b6f218"], ["C2", "C3", 3.60, "b6f218"],
  ["C3", "X", 3.55, "c41e07"],
];
const children = (id) => EDGES.filter((e) => e[0] === id);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
let state, timer = null, approvedCase = null;

function reset() {
  stop();
  state = { visited: [], frontier: ["S"], calls: 0, done: false, success: false, used: new Set(), parent: {} };
  $("budgetVal").textContent = $("budget").value;
  $("log").innerHTML = ""; $("status").className = "status"; $("status").textContent = "Ready. Press Step or Play.";
  $("claims").innerHTML = `<tr><td colspan="3" class="muted">No trace yet.</td></tr>`;
  $("withdrawn").textContent = ""; $("approve").disabled = true; $("reject").disabled = true;
  $("report").className = "report muted small"; $("report").textContent = "Awaiting a finished trace.";
  draw();
}

function log(msg) { const li = document.createElement("li"); li.innerHTML = msg; $("log").appendChild(li); li.scrollIntoView({ block: "nearest" }); }

function priorityScore(id) {
  // Larger share of the parent's outflow + change-like output = more promising (stand-in for the learned scorer).
  const e = EDGES.find((x) => x[1] === id);
  const total = children(e[0]).reduce((s, x) => s + x[2], 0);
  return e[2] / total + (NODES[id].kind === "chg" ? 0.3 : 0) + (NODES[id].kind === "svc" ? 0.5 : 0) - (NODES[id].kind === "cj" ? 1 : 0);
}

function step() {
  if (state.done) return;
  const budget = +$("budget").value;
  if (state.calls >= budget) { finish(false, `Budget of ${budget} calls exhausted before reaching a service.`); return; }
  if (!state.frontier.length) { finish(false, "No addresses left to explore."); return; }
  const strategy = $("strategy").value;
  let id;
  if (strategy === "bfs") id = state.frontier.shift();
  else {
    state.frontier.sort((a, b) => priorityScore(b) - priorityScore(a));
    id = state.frontier.shift();
  }
  state.calls += 1; state.visited.push(id); state.current = id;
  if (state.parent[id]) state.used.add(state.parent[id] + ">" + id);
  const n = NODES[id];
  if (n.kind === "svc") { log(`call ${state.calls}: <b>${n.label}</b> — published label: <b>exchange</b>. Stop.`); finish(true, `Reached a labelled exchange in ${state.calls} calls.`); return; }
  if (n.kind === "cj") log(`call ${state.calls}: <b>${n.label}</b> looks like CoinJoin — clustering off, branch closed.`);
  else {
    const kids = children(id).filter((e) => !state.visited.includes(e[1]) && !state.frontier.includes(e[1]));
    kids.forEach((e) => { state.frontier.push(e[1]); state.parent[e[1]] = id; });
    const note = strategy === "priority" && kids.length ? ` · next best: <b>${NODES[[...kids].sort((a, b) => priorityScore(b[1]) - priorityScore(a[1]))[0][1]].label}</b>` : "";
    log(`call ${state.calls}: fetch <b>${n.label}</b> → ${kids.length} new output(s)${note}`);
  }
  draw();
}

function finish(success, msg) {
  stop(); state.done = true; state.success = success;
  $("status").className = "status " + (success ? "win" : "lose"); $("status").textContent = msg;
  draw(); runCritic();
}

function play() { if (timer) { stop(); return; } $("play").textContent = "Pause"; timer = setInterval(() => { step(); if (state.done) stop(); }, 650); }
function stop() { clearInterval(timer); timer = null; $("play").textContent = "Play"; }

const radius = (n) => (n.kind === "svc" ? 22 : n.kind === "seed" ? 18 : 14);

function draw() {
  let s = `<defs><marker id="g" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8z" fill="var(--muted)"/></marker></defs>`;
  for (const [a, b, amt] of EDGES) {
    const A = NODES[a], B = NODES[b], on = state.used.has(a + ">" + b);
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 - 6;
    // Stop the line at the target's edge so the arrowhead stays visible.
    const len = Math.hypot(B.x - A.x, B.y - A.y), r = radius(B) + 3;
    const ex = B.x - ((B.x - A.x) / len) * r, ey = B.y - ((B.y - A.y) / len) * r;
    s += `<path d="M${A.x},${A.y}L${ex},${ey}" class="e ${on ? "on" : ""}" marker-end="url(#g)"/><text x="${mx}" y="${my}" class="amt">${amt}</text>`;
  }
  for (const [id, n] of Object.entries(NODES)) {
    const cls = ["n", n.kind || "", state.visited.includes(id) ? "v" : "", state.frontier.includes(id) ? "f" : "", state.current === id ? "pick" : ""].join(" ");
    const r = radius(n);
    s += `<circle cx="${n.x}" cy="${n.y}" r="${r}" class="${cls}"><title>${n.label}</title></circle><text x="${n.x}" y="${n.y + r + 15}" class="lbl">${n.label}</text>`;
  }
  $("graph").innerHTML = s;
  $("calls").textContent = state.calls; $("hops").textContent = state.visited.length;
}

// ---------- Critic + approval ----------
let claims = [];
function runCritic() {
  const v = (id) => state.visited.includes(id);
  claims = [];
  if (v("C1")) claims.push({ text: "Output to c1 is likely the sender's change (largest, non-round amount)", tx: "3f9a1c", keep: true, why: "structure checks pass" });
  if (v("C2")) claims.push({ text: "Peel chain c1 → c2 peels off 0.30 BTC", tx: "7a4d90", keep: true, why: "outpoints connect" });
  if (v("C3")) claims.push({ text: "Peel chain continues c2 → c3 (0.25 BTC peeled)", tx: "b6f218", keep: true, why: "outpoints connect" });
  if (state.success) claims.push({ text: "3.55 BTC reaches an address labelled as an exchange", tx: "c41e07", keep: true, why: "published label with source" });
  if (v("CJ")) claims.push({ text: "a4 and the coinjoin outputs share an owner", tx: "e09b31", keep: false, why: "CoinJoin breaks common-input clustering" });
  if (v("N1")) claims.push({ text: "n1 belongs to an exchange", tx: "8be204", keep: false, why: "no published label supports this" });
  if (!state.success) claims.push({ text: "Funds were cashed out at a service", tx: "—", keep: false, why: "trace never reached a labelled service" });
  claims.push({ text: "The seed's owner is responsible for the attack", tx: "—", keep: false, why: "ownership/guilt claims are never allowed" });
  $("claims").innerHTML = claims.map((c) => `<tr><td>${esc(c.text)}</td><td><code>${c.tx === "—" ? "none" : "tx " + c.tx + "…"}</code></td><td><span class="tag ${c.keep ? "keep" : "drop"}">${c.keep ? "kept" : "withdrawn"}</span><br><span class="small muted">${esc(c.why)}</span></td></tr>`).join("");
  const dropped = claims.filter((c) => !c.keep).length;
  $("withdrawn").textContent = `${dropped} claim(s) withdrawn by the critic — counted, not hidden.`;
  $("approve").disabled = false; $("reject").disabled = false;
  $("report").className = "report small"; $("report").textContent = "Awaiting human approval. The model that ran the trace cannot approve its own case.";
}

$("approve").addEventListener("click", () => {
  const kept = claims.filter((c) => c.keep);
  approvedCase = { visited: [...state.visited] };
  $("report").innerHTML = `<b class="ok">Approved by a human reviewer.</b> Report (every claim cites a transaction):<ul>${kept.map((c) => `<li>${esc(c.text)} — <code>tx ${c.tx}…</code></li>`).join("") || "<li>No supported claims.</li>"}</ul>` +
    (state.success ? `<div class="draft"><b>DRAFT</b> request for records to the exchange — <em>status: draft only, never sent</em>. A person decides what happens next.</div>` : "");
  $("approve").disabled = true; $("reject").disabled = true;
  $("case2").disabled = false; $("memOut").textContent = "Case #1 saved to memory.";
});
$("reject").addEventListener("click", () => {
  $("report").innerHTML = `<b class="bad">Rejected.</b> No claims are released to any client.`;
  $("approve").disabled = true; $("reject").disabled = true;
});
$("case2").addEventListener("click", () => {
  const touched = approvedCase.visited.includes("C3") ? "c3" : approvedCase.visited.includes("C1") ? "c1" : null;
  $("memOut").innerHTML = touched
    ? `<div class="memhit"><b>Case #2</b> (a different victim, reported elsewhere) sends funds to <b>${touched}</b> after two hops.<br><b>Memory:</b> address cluster <b>${touched}</b> appeared in approved <b>case #1</b>. Possible link between cases — flagged for an analyst, not concluded.</div>`
    : `<div class="memhit"><b>Case #2</b> shares no clusters with remembered cases. (Try approving a trace that got further.)</div>`;
  $("case2").disabled = true;
});

// ---------- Controls ----------
$("budget").addEventListener("input", () => { $("budgetVal").textContent = $("budget").value; });
$("step").addEventListener("click", step);
$("play").addEventListener("click", play);
$("reset").addEventListener("click", reset);
$("strategy").addEventListener("change", reset);
$("budget").addEventListener("change", reset);

// ---------- Result charts ----------
(function charts() {
  const q = [["Breadth-first", 16, "var(--bar3)"], ["Heuristic priority", 3, "var(--bar2)"], ["Learned value model", 3, "var(--bar)"]];
  let s = "";
  q.forEach(([name, v, c], i) => {
    const y = 20 + i * 58, w = (v / 16) * 280;
    s += `<text x="10" y="${y + 20}" class="s" style="text-anchor:start;font-size:13px;fill:var(--ink)">${name}</text>`;
    s += `<rect x="150" y="${y + 4}" width="${w}" height="24" rx="4" style="fill:${c}"/><text x="${158 + w}" y="${y + 21}" class="s" style="text-anchor:start">${v} queries</text>`;
  });
  $("qchart").innerHTML = s;

  const m = [["GraphSAGE", 0.946, 0.699], ["GAT", 0.572, 0.563], ["XGBoost", 0.931, 0.712]];
  const y0 = 170, h = 140;
  let a = `<line x1="40" x2="470" y1="${y0}" y2="${y0}" class="grid"/>`;
  const base = y0 - 0.517 * h;
  a += `<line x1="40" x2="470" y1="${base}" y2="${base}" style="stroke:var(--bad);stroke-dasharray:5 4"/><text x="468" y="${base - 5}" class="s" style="text-anchor:end;fill:var(--bad)">chance ≈ 0.517</text>`;
  m.forEach(([name, full, live], i) => {
    const x = 70 + i * 140;
    a += `<rect x="${x}" y="${y0 - full * h}" width="44" height="${full * h}" rx="3" style="fill:var(--bar)"/><text x="${x + 22}" y="${y0 - full * h - 5}" class="s">${full}</text>`;
    a += `<rect x="${x + 50}" y="${y0 - live * h}" width="44" height="${live * h}" rx="3" style="fill:var(--bar2)"/><text x="${x + 72}" y="${y0 - live * h - 5}" class="s">${live}</text>`;
    a += `<text x="${x + 47}" y="${y0 + 18}" class="t" style="font-size:13px">${name}</text>`;
  });
  a += `<rect x="70" y="${y0 + 32}" width="12" height="10" style="fill:var(--bar)"/><text x="88" y="${y0 + 41}" class="s" style="text-anchor:start">all features</text>`;
  a += `<rect x="190" y="${y0 + 32}" width="12" height="10" style="fill:var(--bar2)"/><text x="208" y="${y0 + 41}" class="s" style="text-anchor:start">features computable live</text>`;
  $("apchart").innerHTML = a;
})();

reset();
