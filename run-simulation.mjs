// Headless simulation runner — extracts core logic from page.jsx
import { readFileSync } from "fs";

// ---- Constants (from page.jsx) ----
const FI_TYPE_ORDER = ["individual", "institutional", "speculator"];
const TYPE_TARGET = { individual: 0.5333, institutional: 0.2, speculator: 0.2667 };
const FI_MAX_L1_DISTANCE = Math.max(
  ...FI_TYPE_ORDER.map(focus =>
    FI_TYPE_ORDER.reduce((sum, type) => sum + Math.abs((type === focus ? 1 : 0) - TYPE_TARGET[type]), 0)
  )
);
const PM = [0.4, 0.55, 0.7, 0.85, 0.95, 1.0, 1.1, 1.25, 1.5];
const BF = [0.2, 0.4, 0.6, 0.8, 1.0];
const ACTION_COUNT = PM.length * BF.length;
const DESIGN_FRACTIONS = [1000, 2500, 5000, 10000];
const DESIGN_RULES = ["proportional", "priority", "equal", "hybrid"];
const DESIGN_STEPS = ["linear", "exponential", "adaptive"];
const MIN_VALIDATED_FRACTIONS = 1000;

const LEGACY_BASE = { engineVersion: "legacy", label: "RTZ v1.0 legacy", alpha: 0.5, numFractions: 10000, allocationRule: "hybrid", stepType: "linear", maxConcentration: 1.0 };
const VALIDATED_BASE = { engineVersion: "validated", label: "RTZ v1.1 validated", alpha: 0.5, numFractions: MIN_VALIDATED_FRACTIONS, allocationRule: "hybrid", stepType: "linear", maxConcentration: 1.0 };

// ---- Utility ----
function round3(v) { return Math.round(v * 1000) / 1000; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function enforceGranularityPolicy(cfg) {
  if (cfg.engineVersion === "legacy") return { ...cfg };
  return { ...cfg, numFractions: Math.max(MIN_VALIDATED_FRACTIONS, cfg.numFractions) };
}
function mulberry32(seed = 123456789) {
  let t = seed >>> 0;
  return function rand() { t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function mean(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function sd(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1)); }

function weightedScore(m) { return round3(m.rr * 0.25 + m.ae * 0.25 + (1 - m.eg) * 0.2 + m.cr * 0.15 + m.fi * 0.15); }
function targetHitCount(m) { return [m.rr >= 0.9, m.ae >= 0.7, m.eg <= 0.15, m.cr >= 0.85, m.fi >= 0.6].filter(Boolean).length; }
function fairnessAwareSelectionScore(m) {
  return round3(weightedScore(m) + (m.fi >= 0.6 ? 0.04 : 0) + (m.eg <= 0.15 ? 0.04 : 0) + m.fi * 0.04 + (1 - m.eg) * 0.03 + targetHitCount(m) * 0.01);
}
function isFairnessPreferred(m) { return m.rr >= 0.9 && m.fi >= 0.6 && m.eg <= 0.15; }

function compareEvaluations(a, b) {
  const aP = isFairnessPreferred(a.mean), bP = isFairnessPreferred(b.mean);
  if (aP !== bP) return aP ? -1 : 1;
  if (a.targetHits !== b.targetHits) return b.targetHits - a.targetHits;
  if (Math.abs(a.mean.fi - b.mean.fi) > 1e-9) return b.mean.fi - a.mean.fi;
  if (Math.abs(a.mean.eg - b.mean.eg) > 1e-9) return a.mean.eg - b.mean.eg;
  if (Math.abs(a.selectionScore - b.selectionScore) > 1e-9) return b.selectionScore - a.selectionScore;
  return b.score - a.score;
}

// ---- Auction engines ----
function findClearingPriceOriginalLegacy(bids, nf, cfg) {
  const startPrice = cfg.minPrice || 1; let p = startPrice;
  for (let i = 0; i < 5000; i++) { const acc = bids.filter(b => b.maxP >= p); const demand = acc.reduce((s, b) => s + b.budget / p, 0); if (demand < nf) break; p += 1; }
  for (let i = 0; i < 5000; i++) { const acc = bids.filter(b => b.maxP >= p); const demand = acc.reduce((s, b) => s + b.budget / p, 0); if (demand >= nf) break; p -= 0.1; if (p < startPrice) return { tooSmall: true, fp: round3(p), accepted: [] }; }
  if (p < startPrice) return { tooSmall: true, fp: round3(p), accepted: [] };
  return { tooSmall: false, fp: round3(p), accepted: bids.filter(b => b.maxP >= p) };
}

function findClearingPrice(bids, nf, cfg) {
  let p = cfg.minPrice || 1; let lastFeasiblePrice = null;
  for (let i = 0; i < 5000; i++) {
    const active = bids.filter(b => b.maxP >= p && b.budget >= p);
    const demand = active.reduce((s, b) => s + Math.floor(b.budget / p), 0);
    if (!active.length || demand < nf) break;
    lastFeasiblePrice = p;
    if (cfg.stepType === "exponential") p *= 1.05; else if (cfg.stepType === "adaptive") p += Math.max(0.1, (demand - nf) * 0.01); else p += 0.5;
  }
  return round3(lastFeasiblePrice ?? p);
}

function runAuctionLegacy(bids, nf, cfg) {
  const { tooSmall, fp, accepted: acc } = findClearingPriceOriginalLegacy(bids, nf, cfg);
  if (tooSmall || !acc.length) return { ok: false, cleared: false, fp, al: [], tot: 0 };
  const scores = acc.map(b => b.budget * b.maxP); const totalScore = scores.reduce((a, b) => a + b, 0);
  if (totalScore <= 0) return { ok: false, cleared: false, fp, al: [], tot: 0 };
  const shares = scores.map(score => Math.trunc(nf * (score / totalScore)));
  let allocated = shares.reduce((a, b) => a + b, 0); const rest = nf - allocated;
  if (rest > 0) { const firstIdx = shares.map((value, i) => ({ i, value })).sort((a, b) => b.value - a.value)[0].i; shares[firstIdx] += rest; }
  const al = acc.map((b, i) => ({ ...b, shares: shares[i], cost: shares[i] * fp }));
  const tot = shares.reduce((a, b) => a + b, 0);
  return { ok: true, cleared: tot === nf, fp, al, tot };
}

function getAllocationScores(acc, rule) {
  if (rule === "proportional") return acc.map(b => Math.max(0, b.budget));
  if (rule === "priority") return acc.map(b => Math.max(0, b.maxP));
  if (rule === "equal") return acc.map(() => 1);
  return acc.map(b => Math.max(0, b.budget * b.maxP));
}

function allocateCapped(acc, nf, fp, cfg) {
  const concCap = Math.max(1, Math.floor(nf * cfg.maxConcentration));
  const budgetCaps = acc.map(b => Math.floor(b.budget / fp));
  const caps = budgetCaps.map(v => Math.max(0, Math.min(v, concCap)));
  const maxSellable = Math.min(nf, caps.reduce((s, x) => s + x, 0));
  const shares = Array(acc.length).fill(0);
  const scores = getAllocationScores(acc, cfg.allocationRule);
  let remaining = maxSellable; let guard = 0;
  while (remaining > 0 && guard < 25) {
    guard++; const eligible = acc.map((_, i) => i).filter(i => caps[i] > shares[i] && scores[i] > 0);
    if (!eligible.length) break;
    const totalScore = eligible.reduce((s, i) => s + scores[i], 0);
    if (totalScore <= 0) break;
    const quotas = eligible.map(i => ({ i, q: (scores[i] / totalScore) * remaining }));
    let added = 0;
    for (const { i, q } of quotas) { const room = caps[i] - shares[i]; const give = Math.min(room, Math.floor(q)); if (give > 0) { shares[i] += give; added += give; } }
    remaining -= added; if (remaining <= 0) break;
    const remainders = quotas.map(({ i, q }) => ({ i, r: q - Math.floor(q) })).sort((a, b) => b.r - a.r);
    let progressed = false;
    for (const { i } of remainders) { if (remaining <= 0) break; if (shares[i] < caps[i]) { shares[i] += 1; remaining -= 1; progressed = true; } }
    if (added === 0 && !progressed) break;
  }
  return { shares, sold: shares.reduce((a, b) => a + b, 0), caps };
}

function runAuctionValidated(bids, nf, cfg) {
  const fp = findClearingPrice(bids, nf, cfg);
  const acc = bids.filter(b => b.maxP >= fp && b.budget >= fp);
  if (!acc.length) return { ok: false, cleared: false, fp, al: [], tot: 0 };
  const { shares, sold, caps } = allocateCapped(acc, nf, fp, cfg);
  if (sold <= 0) return { ok: false, cleared: false, fp, al: [], tot: 0 };
  const al = acc.map((b, i) => ({ ...b, shares: shares[i], cap: caps[i], cost: shares[i] * fp })).filter(x => x.shares > 0);
  return { ok: true, cleared: sold === nf, fp, al, tot: sold };
}

function runAuction(bids, nf, cfg) { return cfg.engineVersion === "legacy" ? runAuctionLegacy(bids, nf, cfg) : runAuctionValidated(bids, nf, cfg); }

// ---- Agents ----
function mkAgent(id, type, tv, nf, rand) {
  const baseFractionValue = tv / nf; let budgetBase, noiseScale;
  if (type === "individual") { budgetBase = 500 + rand() * 4500; noiseScale = 0.2; }
  else if (type === "institutional") { budgetBase = 20000 + rand() * 180000; noiseScale = 0.05; }
  else if (type === "speculator") { budgetBase = 2000 + rand() * 18000; noiseScale = 0.3; }
  else { budgetBase = 500 + rand() * 4500; noiseScale = 0.15; }
  const privateValue = baseFractionValue * (0.8 + rand() * 0.4);
  const estimate = privateValue * (1 + (rand() - 0.5) * 2 * noiseScale);
  return { id, type, bb: Math.round(budgetBase), pv: privateValue, ev: estimate, q: new Float32Array(ACTION_COUNT), c: new Float32Array(ACTION_COUNT), tr: 0, ng: 0 };
}
function chooseAction(agent, eps, rand) { if (rand() < eps) return Math.floor(rand() * ACTION_COUNT); let best = 0; for (let i = 1; i < ACTION_COUNT; i++) { if (agent.q[i] > agent.q[best]) best = i; } return best; }
function actionToBid(action, agent) { return { id: agent.id, type: agent.type, maxP: round3(agent.ev * PM[Math.floor(action / BF.length)]), budget: Math.round(agent.bb * BF[action % BF.length]), privateValue: agent.pv }; }
function updateAgent(agent, action, reward) { agent.c[action] += 1; agent.q[action] += (reward - agent.q[action]) / agent.c[action]; agent.tr += reward; agent.ng += 1; }

function fairnessByType(allocations) {
  const sharesByType = Object.fromEntries(FI_TYPE_ORDER.map(t => [t, 0]));
  allocations.forEach(a => { if (sharesByType[a.type] !== undefined) sharesByType[a.type] += a.shares; });
  const total = FI_TYPE_ORDER.reduce((sum, type) => sum + sharesByType[type], 0);
  if (total <= 0) return 0;
  const distance = FI_TYPE_ORDER.reduce((sum, type) => { const observed = sharesByType[type] / total; return sum + Math.abs(observed - TYPE_TARGET[type]); }, 0);
  return round3(clamp(1 - distance / FI_MAX_L1_DISTANCE, 0, 1));
}

function optimalPrivateValueAllocation(agents, totalShares, fp) {
  const sorted = [...agents].sort((a, b) => b.pv - a.pv); let remaining = totalShares; let optimum = 0;
  for (const agent of sorted) { if (remaining <= 0) break; const canAfford = Math.floor(agent.bb / fp); const take = Math.min(remaining, canAfford); optimum += take * agent.pv; remaining -= take; }
  return optimum;
}

function trainOnce(cfg, nAgents, tv, roundsLearn, roundsEval, seed) {
  const rand = mulberry32(seed); const types = [];
  for (let i = 0; i < nAgents; i++) { const r = i / nAgents; types.push(r < 0.4 ? "individual" : r < 0.55 ? "institutional" : r < 0.75 ? "speculator" : "redteam"); }
  const agents = types.map((type, i) => mkAgent(i, type, tv, cfg.numFractions, rand));
  const minPrice = round3(cfg.alpha * tv / cfg.numFractions);
  for (let rd = 0; rd < roundsLearn; rd++) {
    const eps = Math.max(0.05, 1 - (rd / Math.max(1, roundsLearn)) * 0.95);
    const actions = agents.map(agent => chooseAction(agent, eps, rand));
    const bids = agents.map((agent, idx) => actionToBid(actions[idx], agent));
    const result = runAuction(bids, cfg.numFractions, { ...cfg, minPrice });
    const payoffs = {};
    if (result.ok) result.al.forEach(al => { payoffs[al.id] = { profit: al.shares * al.privateValue - al.cost, cost: al.cost }; });
    const referenceRoi = { individual: [], redteam: [] };
    agents.forEach((agent, idx) => {
      const info = payoffs[agent.id]; const reward = info ? info.profit : -0.5;
      const roi = info && info.cost > 0 ? info.profit / info.cost : -1;
      let shaped = reward;
      if (agent.type === "redteam" && referenceRoi.individual.length) { const avg = mean(referenceRoi.individual); shaped = reward + Math.max(0, roi - avg) * Math.max(1, Math.abs(reward)) * 0.3; }
      updateAgent(agent, actions[idx], shaped);
      if (agent.type === "individual") referenceRoi.individual.push(roi);
      if (agent.type === "redteam") referenceRoi.redteam.push(roi);
    });
  }
  const metrics = { rr: 0, ae: 0, eg: 0, cr: 0, fi: 0 }; let successful = 0;
  for (let rd = 0; rd < roundsEval; rd++) {
    const actions = agents.map(agent => chooseAction(agent, 0.05, rand));
    const bids = agents.map((agent, idx) => actionToBid(actions[idx], agent));
    const result = runAuction(bids, cfg.numFractions, { ...cfg, minPrice });
    if (!result.ok) continue; successful++;
    const revenue = result.al.reduce((s, x) => s + x.cost, 0); metrics.rr += Math.min(revenue / tv, 2);
    const realizedValue = result.al.reduce((s, x) => s + x.shares * x.privateValue, 0);
    const optimum = optimalPrivateValueAllocation(agents, result.tot, result.fp);
    metrics.ae += optimum > 0 ? Math.min(realizedValue / optimum, 1) : 0;
    const redteamAllocs = result.al.filter(x => x.type === "redteam"); const individualAllocs = result.al.filter(x => x.type === "individual");
    const roi = row => row.cost > 0 ? (row.shares * row.privateValue - row.cost) / row.cost : 0;
    const redRoi = redteamAllocs.length ? mean(redteamAllocs.map(roi)) : 0; const indRoi = individualAllocs.length ? mean(individualAllocs.map(roi)) : 0;
    metrics.eg += clamp((redRoi - indRoi) / (Math.abs(redRoi) + Math.abs(indRoi) + 0.01), 0, 1);
    metrics.fi += fairnessByType(result.al); if (result.cleared) metrics.cr += 1;
  }
  if (successful > 0) { metrics.rr /= successful; metrics.ae /= successful; metrics.eg /= successful; metrics.fi /= successful; }
  metrics.cr /= Math.max(1, roundsEval);
  Object.keys(metrics).forEach(k => { metrics[k] = round3(metrics[k]); });
  return metrics;
}

function evaluateConfig(cfg, params) {
  const normalizedCfg = enforceGranularityPolicy(cfg);
  const runs = [];
  for (let r = 0; r < params.reps; r++) runs.push(trainOnce(normalizedCfg, params.nAgents, params.tv, params.roundsLearn, params.roundsEval, params.seedBase + r * 7919));
  const metricKeys = ["rr", "ae", "eg", "cr", "fi"];
  const meanMetrics = {}, sdMetrics = {};
  metricKeys.forEach(key => { const values = runs.map(run => run[key]); meanMetrics[key] = round3(mean(values)); sdMetrics[key] = round3(sd(values)); });
  return { cfg: normalizedCfg, mean: meanMetrics, sd: sdMetrics, score: weightedScore(meanMetrics), selectionScore: fairnessAwareSelectionScore(meanMetrics), targetHits: targetHitCount(meanMetrics), runs };
}

// ---- Search ----
function randomDesign(rand) {
  return { engineVersion: "validated", label: "candidate", alpha: round3(0.3 + rand() * 0.6), numFractions: DESIGN_FRACTIONS[Math.floor(rand() * DESIGN_FRACTIONS.length)], allocationRule: DESIGN_RULES[Math.floor(rand() * DESIGN_RULES.length)], stepType: DESIGN_STEPS[Math.floor(rand() * DESIGN_STEPS.length)], maxConcentration: round3(0.1 + rand() * 0.9) };
}
function mutateDesign(parent, rand) {
  const child = { ...parent, engineVersion: "validated", label: "candidate" }; const move = Math.floor(rand() * 5);
  if (move === 0) child.alpha = round3(clamp(child.alpha + (rand() - 0.5) * 0.15, 0.3, 0.9));
  if (move === 1) { const idx = DESIGN_FRACTIONS.indexOf(child.numFractions); const delta = rand() < 0.5 ? -1 : 1; child.numFractions = DESIGN_FRACTIONS[clamp(idx + delta, 0, DESIGN_FRACTIONS.length - 1)]; }
  if (move === 2) child.allocationRule = DESIGN_RULES[Math.floor(rand() * DESIGN_RULES.length)];
  if (move === 3) child.stepType = DESIGN_STEPS[Math.floor(rand() * DESIGN_STEPS.length)];
  if (move === 4) child.maxConcentration = round3(clamp(child.maxConcentration + (rand() - 0.5) * 0.2, 0.1, 1));
  return child;
}

function dominates(a, b) {
  let strict = false;
  for (const key of ["rr", "ae", "eg", "cr", "fi"]) {
    const dir = key === "eg" ? "min" : "max";
    if (dir === "max") { if (a[key] < b[key]) return false; if (a[key] > b[key]) strict = true; }
    else { if (a[key] > b[key]) return false; if (a[key] < b[key]) strict = true; }
  }
  return strict;
}

// ---- MAIN ----
const params = { nAgents: 30, tv: 50000, roundsLearn: 160, roundsEval: 80, reps: 9, seedBase: 1000, seedSearch: 424242, searchExplore: 10, searchExploit: 14 };

console.log("=== RTZ Auction Lab — Headless Simulation ===\n");
console.log("Params:", JSON.stringify(params, null, 2), "\n");

// 1. Legacy
console.log("Evaluating RTZ v1.0 legacy...");
const legacy = evaluateConfig(LEGACY_BASE, params);
console.log("  done.");

// 2. Validated
console.log("Evaluating RTZ v1.1 validated...");
const validated = evaluateConfig(VALIDATED_BASE, params);
console.log("  done.");

// 3. Redesign search
console.log("Searching RTZ v2.0 redesign...");
const rand = mulberry32(params.seedSearch);
const all = [];
for (let i = 0; i < params.searchExplore; i++) {
  const cfg = randomDesign(rand);
  const evaluated = evaluateConfig(cfg, { ...params, seedBase: params.seedBase + 1000 + i * 37 });
  all.push(evaluated);
  process.stdout.write(`  explore ${i + 1}/${params.searchExplore}\r`);
}
for (let i = 0; i < params.searchExploit; i++) {
  const ordered = [...all].sort(compareEvaluations);
  const elite = ordered.slice(0, Math.max(3, Math.ceil(ordered.length * 0.2)));
  const parent = elite[Math.floor(rand() * elite.length)];
  const cfg = mutateDesign(parent.cfg, rand);
  const evaluated = evaluateConfig(cfg, { ...params, seedBase: params.seedBase + 5000 + i * 53 });
  all.push(evaluated);
  process.stdout.write(`  exploit ${i + 1}/${params.searchExploit}\r`);
}
const ordered = [...all].sort(compareEvaluations);
const best = ordered[0];
console.log("\n  done. Best config:", JSON.stringify(best.cfg, null, 2));

// 4. Print comparison table
function fmtPct(v) { return (v * 100).toFixed(1) + "%"; }
function fmtPctSd(m, s) { return fmtPct(m) + " ± " + fmtPct(s); }

console.log("\n=== COMPARISON TABLE ===\n");
console.log("| Metryka                  | RTZ v1.0 legacy        | RTZ v1.1 validated     | RTZ v2.0 best          |");
console.log("|--------------------------|------------------------|------------------------|------------------------|");
for (const [key, label] of [["rr", "M1 Revenue Ratio"], ["ae", "M2 Allocative Efficiency"], ["eg", "M3 Exploitation Gap"], ["cr", "M4 Completion Rate"], ["fi", "M5 Fairness Index"]]) {
  console.log(`| ${label.padEnd(24)} | ${fmtPctSd(legacy.mean[key], legacy.sd[key]).padEnd(22)} | ${fmtPctSd(validated.mean[key], validated.sd[key]).padEnd(22)} | ${fmtPctSd(best.mean[key], best.sd[key]).padEnd(22)} |`);
}
console.log(`| ${"Weighted score".padEnd(24)} | ${legacy.score.toFixed(3).padEnd(22)} | ${validated.score.toFixed(3).padEnd(22)} | ${best.score.toFixed(3).padEnd(22)} |`);
console.log(`| ${"Selection score".padEnd(24)} | ${legacy.selectionScore.toFixed(3).padEnd(22)} | ${validated.selectionScore.toFixed(3).padEnd(22)} | ${best.selectionScore.toFixed(3).padEnd(22)} |`);
console.log(`| ${"Target hits".padEnd(24)} | ${String(legacy.targetHits).padEnd(22)} | ${String(validated.targetHits).padEnd(22)} | ${String(best.targetHits).padEnd(22)} |`);
console.log(`| ${"Fairness-preferred".padEnd(24)} | ${String(isFairnessPreferred(legacy.mean)).padEnd(22)} | ${String(isFairnessPreferred(validated.mean)).padEnd(22)} | ${String(isFairnessPreferred(best.mean)).padEnd(22)} |`);

console.log("\n=== V2.0 BEST CONFIG ===");
console.log(`  alpha: ${best.cfg.alpha}`);
console.log(`  numFractions: ${best.cfg.numFractions}`);
console.log(`  allocationRule: ${best.cfg.allocationRule}`);
console.log(`  stepType: ${best.cfg.stepType}`);
console.log(`  maxConcentration: ${best.cfg.maxConcentration}`);

// 5. Deltas v2.0 vs v1.1
console.log("\n=== DELTAS v2.0 vs v1.1 ===");
for (const key of ["rr", "ae", "eg", "cr", "fi"]) {
  const delta = best.mean[key] - validated.mean[key];
  const dir = key === "eg" ? "(lower is better)" : "(higher is better)";
  console.log(`  ${key}: ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp ${dir}`);
}
console.log(`  score: ${(best.score - validated.score).toFixed(3)}`);
console.log(`  selection: ${(best.selectionScore - validated.selectionScore).toFixed(3)}`);

// 6. Top-5 Pareto
const pareto = all.filter((item, idx) => !all.some((other, j) => j !== idx && dominates(other.mean, item.mean)));
console.log(`\n=== PARETO FRONT (${pareto.length} configs) ===`);
pareto.sort(compareEvaluations).slice(0, 5).forEach((p, i) => {
  console.log(`  #${i + 1}: α=${p.cfg.alpha} S=${p.cfg.numFractions} R=${p.cfg.allocationRule} step=${p.cfg.stepType} c=${p.cfg.maxConcentration} | RR=${fmtPct(p.mean.rr)} AE=${fmtPct(p.mean.ae)} EG=${fmtPct(p.mean.eg)} CR=${fmtPct(p.mean.cr)} FI=${fmtPct(p.mean.fi)} sel=${p.selectionScore.toFixed(3)}`);
});
