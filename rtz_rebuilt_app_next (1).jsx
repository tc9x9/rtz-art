
import React, { useCallback, useMemo, useRef, useState } from "react";
import experimentDefaults from "./config/experiment-defaults.json";

// =========================
// RTZ Auction Lab
// v1.0 legacy -> v1.1 validated -> v2.0 redesign
// =========================

const TYPE_ORDER = ["individual", "institutional", "speculator", "redteam"];
const FI_TYPE_ORDER = ["individual", "institutional", "speculator"];
const TYPE_TARGET = {
  individual: 0.5333,
  institutional: 0.2,
  speculator: 0.2667,
};
const FI_MAX_L1_DISTANCE = Math.max(
  ...FI_TYPE_ORDER.map(focus =>
    FI_TYPE_ORDER.reduce((sum, type) => sum + Math.abs((type === focus ? 1 : 0) - TYPE_TARGET[type]), 0)
  )
);
const METRIC_LABELS = {
  rr: "M1 Revenue Ratio",
  ae: "M2 Allocative Efficiency",
  eg: "M3 Exploitation Gap",
  cr: "M4 Completion Rate",
  fi: "M5 Fairness Index (market-only)",
};
const METRIC_DETAILS = {
  rr: {
    formula: "RR = min(R ÷ V, 2),  R = ∑ᵢ cᵢ = ∑ᵢ p · sᵢ",
    target: "cel: RR ≥ 0.90",
    help: "M1 mierzy przychód aukcji względem wartości fundamentalnej katalogu V. Wyżej jest lepiej, ale konfiguracje fairness-preferred muszą utrzymać co najmniej 90%.",
  },
  ae: {
    formula: "AE = PVᵣₑₐₗ ÷ PV*,  PVᵣₑₐₗ = ∑ᵢ sᵢ · pvᵢ",
    target: "cel: AE ≥ 0.70",
    help: "M2 porównuje wartość prywatną faktycznej alokacji z najlepszą budżetowo wykonalną alokacją przy tej samej cenie. Wyżej jest lepiej.",
  },
  eg: {
    formula: "EG = max((ROIᴿᵉᵈ − ROIᴵⁿᵈ) ÷ (|ROIᴿᵉᵈ| + |ROIᴵⁿᵈ| + 0.01), 0)",
    target: "cel: EG ≤ 0.15",
    help: "M3 wykrywa przewagę Red Teamu nad uczestnikami indywidualnymi. Niżej jest lepiej; zero oznacza brak przewagi Red Teamu w ROI.",
  },
  cr: {
    formula: "CR = Nᶜˡᵉᵃʳᵉᵈₑᵥₐₗ ÷ Tₑᵥₐₗ",
    target: "cel: CR ≥ 0.85",
    help: "M4 mierzy, jak często aukcja sprzedaje pełne S frakcji w rundach ewaluacji. Wyżej jest lepiej.",
  },
  fi: {
    formula: "FI = 1 − (∑ₜ |shareₜ − targetₜ|) ÷ Dₘₐₓ,  t ∈ {Ind, Inst, Spec}",
    target: "cel: FI ≥ 0.60",
    help: "M5 mierzy odległość struktury rynku od target shares. Red Team jest wyłączony z FI i zostaje tylko w diagnostyce EG.",
  },
};
const SELECTION_DETAILS = {
  formula: "score = 0.25·RR + 0.25·AE + 0.20·(1 − EG) + 0.15·CR + 0.15·FI",
  selectionFormula: "selection = score + 0.04·𝟙FI + 0.04·𝟙EG + 0.04·FI + 0.03·(1 − EG) + 0.01·hits",
  help: "Raw score agreguje M1-M5. Fair-aware selection dodaje premie za spełnienie progów FI/EG, niski EG i liczbę trafionych celów; ranking nadal wymaga bariery RR ≥ 0.90 dla wariantu fairness-preferred.",
};
const METRIC_TARGETS = {
  rr: v => v >= 0.9,
  ae: v => v >= 0.7,
  eg: v => v <= 0.15,
  cr: v => v >= 0.85,
  fi: v => v >= 0.6,
};
const METRIC_DIRECTIONS = { rr: "max", ae: "max", eg: "min", cr: "max", fi: "max" };
const PM = [0.4, 0.55, 0.7, 0.85, 0.95, 1.0, 1.1, 1.25, 1.5];
const BF = [0.2, 0.4, 0.6, 0.8, 1.0];
const ACTION_COUNT = PM.length * BF.length;
const DEFAULT_AUTOPILOT_RUN_LIMIT = 7;
const MAX_AUTOPILOT_RUN_LIMIT = 50;
const SEED_BASE_STEP = 1000003;
const SEED_SEARCH_STEP = 104729;

const LEGACY_BASE = {
  engineVersion: "legacy",
  label: "RTZ v1.0 legacy",
  alpha: 0.5,
  numFractions: 10000,
  allocationRule: "hybrid",
  stepType: "linear",
  maxConcentration: 1.0,
};

const MIN_VALIDATED_FRACTIONS = 1000;

const VALIDATED_BASE = {
  engineVersion: "validated",
  label: "RTZ v1.1 validated",
  alpha: 0.5,
  numFractions: MIN_VALIDATED_FRACTIONS,
  allocationRule: "hybrid",
  stepType: "linear",
  maxConcentration: 1.0,
};

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function enforceGranularityPolicy(cfg) {
  if (cfg.engineVersion === "legacy") return { ...cfg };
  return {
    ...cfg,
    numFractions: Math.max(MIN_VALIDATED_FRACTIONS, cfg.numFractions),
  };
}

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mulberry32(seed = 123456789) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

function sd(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

function weightedScore(m) {
  return round3(
    m.rr * 0.25 +
    m.ae * 0.25 +
    (1 - m.eg) * 0.2 +
    m.cr * 0.15 +
    m.fi * 0.15
  );
}

function targetHitCount(m) {
  return ["rr", "ae", "eg", "cr", "fi"].reduce((count, key) => count + (METRIC_TARGETS[key](m[key]) ? 1 : 0), 0);
}

function fairnessAwareSelectionScore(m) {
  return round3(
    weightedScore(m) +
    (METRIC_TARGETS.fi(m.fi) ? 0.04 : 0) +
    (METRIC_TARGETS.eg(m.eg) ? 0.04 : 0) +
    m.fi * 0.04 +
    (1 - m.eg) * 0.03 +
    targetHitCount(m) * 0.01
  );
}

function isFairnessPreferred(m) {
  return METRIC_TARGETS.rr(m.rr) && METRIC_TARGETS.fi(m.fi) && METRIC_TARGETS.eg(m.eg);
}

function compareEvaluations(a, b) {
  const aPreferred = isFairnessPreferred(a.mean);
  const bPreferred = isFairnessPreferred(b.mean);
  if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
  if (a.targetHits !== b.targetHits) return b.targetHits - a.targetHits;
  if (Math.abs(a.mean.fi - b.mean.fi) > 1e-9) return b.mean.fi - a.mean.fi;
  if (Math.abs(a.mean.eg - b.mean.eg) > 1e-9) return a.mean.eg - b.mean.eg;
  if (Math.abs(a.selectionScore - b.selectionScore) > 1e-9) return b.selectionScore - a.selectionScore;
  return b.score - a.score;
}

function betterMetric(key, a, b) {
  return METRIC_DIRECTIONS[key] === "min" ? a < b : a > b;
}

function dominates(a, b) {
  let strict = false;
  for (const key of ["rr", "ae", "eg", "cr", "fi"]) {
    if (METRIC_DIRECTIONS[key] === "max") {
      if (a[key] < b[key]) return false;
      if (a[key] > b[key]) strict = true;
    } else {
      if (a[key] > b[key]) return false;
      if (a[key] < b[key]) strict = true;
    }
  }
  return strict;
}

function computeParetoFront(items) {
  return items.filter((item, idx) => !items.some((other, j) => j !== idx && dominates(other.mean, item.mean)));
}

// -------------------------
// Auction engines
// -------------------------

function findClearingPriceOriginalLegacy(bids, nf, cfg) {
  const startPrice = cfg.minPrice || 1;
  let p = startPrice;
  let accepted = [];

  for (let i = 0; i < 5000; i++) {
    accepted = bids.filter(b => b.maxP >= p);
    const demand = accepted.reduce((s, b) => s + b.budget / p, 0);
    if (demand < nf) break;
    p += 1;
  }

  for (let i = 0; i < 5000; i++) {
    accepted = bids.filter(b => b.maxP >= p);
    const demand = accepted.reduce((s, b) => s + b.budget / p, 0);
    if (demand >= nf) break;
    p -= 0.1;
    if (p < startPrice) return { tooSmall: true, fp: round3(p), accepted: [] };
  }

  if (p < startPrice) return { tooSmall: true, fp: round3(p), accepted: [] };
  return { tooSmall: false, fp: round3(p), accepted };
}

function findClearingPrice(bids, nf, cfg) {
  let p = cfg.minPrice || 1;
  let lastFeasiblePrice = null;

  for (let i = 0; i < 5000; i++) {
    const active = bids.filter(b => b.maxP >= p && b.budget >= p);
    const demand = active.reduce((s, b) => s + Math.floor(b.budget / p), 0);
    if (!active.length || demand < nf) break;

    lastFeasiblePrice = p;

    if (cfg.stepType === "exponential") p *= 1.05;
    else if (cfg.stepType === "adaptive") p += Math.max(0.1, (demand - nf) * 0.01);
    else p += 0.5;
  }

  return round3(lastFeasiblePrice ?? p);
}

function runAuctionLegacy(bids, nf, cfg) {
  const { tooSmall, fp, accepted: acc } = findClearingPriceOriginalLegacy(bids, nf, cfg);
  if (tooSmall) return { ok: false, cleared: false, fp, al: [], tot: 0 };
  if (!acc.length) return { ok: false, cleared: false, fp, al: [], tot: 0 };

  const scores = acc.map(b => b.budget * b.maxP);
  const totalScore = scores.reduce((a, b) => a + b, 0);
  if (totalScore <= 0) return { ok: false, cleared: false, fp, al: [], tot: 0 };

  const shares = scores.map(score => Math.trunc(nf * (score / totalScore)));
  const allocated = shares.reduce((a, b) => a + b, 0);
  const rest = nf - allocated;

  if (rest > 0) {
    const firstIdx = shares
      .map((value, i) => ({ i, value }))
      .sort((a, b) => b.value - a.value)[0].i;
    shares[firstIdx] += rest;
  }

  const al = acc.map((b, i) => ({
    ...b,
    shares: shares[i],
    cost: shares[i] * fp,
  }));

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

  let remaining = maxSellable;
  let guard = 0;

  while (remaining > 0 && guard < 25) {
    guard += 1;
    const eligible = acc
      .map((_, i) => i)
      .filter(i => caps[i] > shares[i] && scores[i] > 0);

    if (!eligible.length) break;

    const totalScore = eligible.reduce((s, i) => s + scores[i], 0);
    if (totalScore <= 0) break;

    const quotas = eligible.map(i => ({
      i,
      q: (scores[i] / totalScore) * remaining,
    }));

    let added = 0;
    for (const { i, q } of quotas) {
      const room = caps[i] - shares[i];
      const give = Math.min(room, Math.floor(q));
      if (give > 0) {
        shares[i] += give;
        added += give;
      }
    }

    remaining -= added;
    if (remaining <= 0) break;

    const remainders = quotas
      .map(({ i, q }) => ({ i, r: q - Math.floor(q) }))
      .sort((a, b) => b.r - a.r);

    let progressed = false;
    for (const { i } of remainders) {
      if (remaining <= 0) break;
      if (shares[i] < caps[i]) {
        shares[i] += 1;
        remaining -= 1;
        progressed = true;
      }
    }

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

  const al = acc
    .map((b, i) => ({
      ...b,
      shares: shares[i],
      cap: caps[i],
      cost: shares[i] * fp,
    }))
    .filter(x => x.shares > 0);

  return { ok: true, cleared: sold === nf, fp, al, tot: sold };
}

function runAuction(bids, nf, cfg) {
  return cfg.engineVersion === "legacy"
    ? runAuctionLegacy(bids, nf, cfg)
    : runAuctionValidated(bids, nf, cfg);
}

// -------------------------
// Agents
// -------------------------

function mkAgent(id, type, tv, nf, rand) {
  const baseFractionValue = tv / nf;
  let budgetBase;
  let noiseScale;

  if (type === "individual") {
    budgetBase = 500 + rand() * 4500;
    noiseScale = 0.2;
  } else if (type === "institutional") {
    budgetBase = 20000 + rand() * 180000;
    noiseScale = 0.05;
  } else if (type === "speculator") {
    budgetBase = 2000 + rand() * 18000;
    noiseScale = 0.3;
  } else {
    budgetBase = 500 + rand() * 4500;
    noiseScale = 0.15;
  }

  const privateValue = baseFractionValue * (0.8 + rand() * 0.4);
  const estimate = privateValue * (1 + (rand() - 0.5) * 2 * noiseScale);

  return {
    id,
    type,
    bb: Math.round(budgetBase),
    pv: privateValue,
    ev: estimate,
    q: new Float32Array(ACTION_COUNT),
    c: new Float32Array(ACTION_COUNT),
    tr: 0,
    ng: 0,
  };
}

function chooseAction(agent, eps, rand) {
  if (rand() < eps) return Math.floor(rand() * ACTION_COUNT);
  let best = 0;
  for (let i = 1; i < ACTION_COUNT; i++) {
    if (agent.q[i] > agent.q[best]) best = i;
  }
  return best;
}

function actionToBid(action, agent) {
  const priceMultiplier = PM[Math.floor(action / BF.length)];
  const budgetFraction = BF[action % BF.length];
  return {
    id: agent.id,
    type: agent.type,
    maxP: round3(agent.ev * priceMultiplier),
    budget: Math.round(agent.bb * budgetFraction),
    privateValue: agent.pv,
  };
}

function updateAgent(agent, action, reward) {
  agent.c[action] += 1;
  agent.q[action] += (reward - agent.q[action]) / agent.c[action];
  agent.tr += reward;
  agent.ng += 1;
}

function fairnessByType(allocations) {
  const sharesByType = Object.fromEntries(FI_TYPE_ORDER.map(t => [t, 0]));
  allocations.forEach(a => {
    if (sharesByType[a.type] !== undefined) sharesByType[a.type] += a.shares;
  });

  const total = FI_TYPE_ORDER.reduce((sum, type) => sum + sharesByType[type], 0);
  if (total <= 0) return 0;

  const distance = FI_TYPE_ORDER.reduce((sum, type) => {
    const observed = sharesByType[type] / total;
    return sum + Math.abs(observed - TYPE_TARGET[type]);
  }, 0);

  return round3(clamp(1 - distance / FI_MAX_L1_DISTANCE, 0, 1));
}

function optimalPrivateValueAllocation(agents, totalShares, fp) {
  const sorted = [...agents].sort((a, b) => b.pv - a.pv);
  let remaining = totalShares;
  let optimum = 0;

  for (const agent of sorted) {
    if (remaining <= 0) break;
    const canAfford = Math.floor(agent.bb / fp);
    const take = Math.min(remaining, canAfford);
    optimum += take * agent.pv;
    remaining -= take;
  }

  return optimum;
}

function trainOnce(cfg, nAgents, tv, roundsLearn, roundsEval, seed) {
  const rand = mulberry32(seed);
  const types = [];
  for (let i = 0; i < nAgents; i++) {
    const r = i / nAgents;
    types.push(r < 0.4 ? "individual" : r < 0.55 ? "institutional" : r < 0.75 ? "speculator" : "redteam");
  }

  const agents = types.map((type, i) => mkAgent(i, type, tv, cfg.numFractions, rand));
  const minPrice = round3(cfg.alpha * tv / cfg.numFractions);

  for (let rd = 0; rd < roundsLearn; rd++) {
    const eps = Math.max(0.05, 1 - (rd / Math.max(1, roundsLearn)) * 0.95);
    const actions = agents.map(agent => chooseAction(agent, eps, rand));
    const bids = agents.map((agent, idx) => actionToBid(actions[idx], agent));
    const result = runAuction(bids, cfg.numFractions, { ...cfg, minPrice });

    const payoffs = {};
    if (result.ok) {
      result.al.forEach(al => {
        payoffs[al.id] = {
          profit: al.shares * al.privateValue - al.cost,
          cost: al.cost,
        };
      });
    }

    const referenceRoi = { individual: [], redteam: [] };
    agents.forEach((agent, idx) => {
      const info = payoffs[agent.id];
      const reward = info ? info.profit : -0.5;
      const roi = info && info.cost > 0 ? info.profit / info.cost : -1;

      let shaped = reward;
      if (agent.type === "redteam" && referenceRoi.individual.length) {
        const averageIndividual = mean(referenceRoi.individual);
        shaped = reward + Math.max(0, roi - averageIndividual) * Math.max(1, Math.abs(reward)) * 0.3;
      }

      updateAgent(agent, actions[idx], shaped);

      if (agent.type === "individual") referenceRoi.individual.push(roi);
      if (agent.type === "redteam") referenceRoi.redteam.push(roi);
    });
  }

  const metrics = { rr: 0, ae: 0, eg: 0, cr: 0, fi: 0 };
  let successful = 0;

  for (let rd = 0; rd < roundsEval; rd++) {
    const actions = agents.map(agent => chooseAction(agent, 0.05, rand));
    const bids = agents.map((agent, idx) => actionToBid(actions[idx], agent));
    const result = runAuction(bids, cfg.numFractions, { ...cfg, minPrice });

    if (!result.ok) continue;
    successful += 1;

    const revenue = result.al.reduce((s, x) => s + x.cost, 0);
    metrics.rr += Math.min(revenue / tv, 2);

    const realizedValue = result.al.reduce((s, x) => s + x.shares * x.privateValue, 0);
    const optimum = optimalPrivateValueAllocation(agents, result.tot, result.fp);
    metrics.ae += optimum > 0 ? Math.min(realizedValue / optimum, 1) : 0;

    const redteamAllocs = result.al.filter(x => x.type === "redteam");
    const individualAllocs = result.al.filter(x => x.type === "individual");
    const roi = row => row.cost > 0 ? (row.shares * row.privateValue - row.cost) / row.cost : 0;
    const redRoi = redteamAllocs.length ? mean(redteamAllocs.map(roi)) : 0;
    const indRoi = individualAllocs.length ? mean(individualAllocs.map(roi)) : 0;
    const scale = Math.abs(redRoi) + Math.abs(indRoi) + 0.01;
    metrics.eg += clamp((redRoi - indRoi) / scale, 0, 1);

    metrics.fi += fairnessByType(result.al);
    if (result.cleared) metrics.cr += 1;
  }

  if (successful > 0) {
    metrics.rr /= successful;
    metrics.ae /= successful;
    metrics.eg /= successful;
    metrics.fi /= successful;
  }
  metrics.cr /= Math.max(1, roundsEval);

  Object.keys(metrics).forEach(k => {
    metrics[k] = round3(metrics[k]);
  });

  return metrics;
}

function evaluateConfig(cfg, params) {
  const normalizedCfg = enforceGranularityPolicy(cfg);
  const { nAgents, tv, roundsLearn, roundsEval, reps, seedBase } = params;
  const runs = [];
  for (let r = 0; r < reps; r++) {
    runs.push(trainOnce(normalizedCfg, nAgents, tv, roundsLearn, roundsEval, seedBase + r * 7919));
  }

  const metricKeys = ["rr", "ae", "eg", "cr", "fi"];
  const meanMetrics = {};
  const sdMetrics = {};
  metricKeys.forEach(key => {
    const values = runs.map(run => run[key]);
    meanMetrics[key] = round3(mean(values));
    sdMetrics[key] = round3(sd(values));
  });

  return {
    cfg: normalizedCfg,
    mean: meanMetrics,
    sd: sdMetrics,
    score: weightedScore(meanMetrics),
    selectionScore: fairnessAwareSelectionScore(meanMetrics),
    targetHits: targetHitCount(meanMetrics),
    runs,
  };
}

// -------------------------
// Search / redesign
// -------------------------

function randomDesign(rand) {
  const rules = ["proportional", "priority", "equal", "hybrid"];
  const steps = ["linear", "exponential", "adaptive"];
  const fractions = [1000, 2500, 5000, 10000];

  return {
    engineVersion: "validated",
    label: "candidate",
    alpha: round3(0.3 + rand() * 0.6),
    numFractions: fractions[Math.floor(rand() * fractions.length)],
    allocationRule: rules[Math.floor(rand() * rules.length)],
    stepType: steps[Math.floor(rand() * steps.length)],
    maxConcentration: round3(0.1 + rand() * 0.9),
  };
}

function mutateDesign(parent, rand) {
  const rules = ["proportional", "priority", "equal", "hybrid"];
  const steps = ["linear", "exponential", "adaptive"];
  const fractions = [1000, 2500, 5000, 10000];

  const child = { ...parent, engineVersion: "validated", label: "candidate" };
  const move = Math.floor(rand() * 5);

  if (move === 0) child.alpha = round3(clamp(child.alpha + (rand() - 0.5) * 0.15, 0.3, 0.9));
  if (move === 1) {
    const idx = fractions.indexOf(child.numFractions);
    const delta = rand() < 0.5 ? -1 : 1;
    child.numFractions = fractions[clamp(idx + delta, 0, fractions.length - 1)];
  }
  if (move === 2) child.allocationRule = rules[Math.floor(rand() * rules.length)];
  if (move === 3) child.stepType = steps[Math.floor(rand() * steps.length)];
  if (move === 4) child.maxConcentration = round3(clamp(child.maxConcentration + (rand() - 0.5) * 0.2, 0.1, 1));

  return child;
}

async function searchRedesign(params, onProgress) {
  const rand = mulberry32(params.seedSearch);
  const all = [];
  const exploreCount = params.searchExplore;
  const exploitCount = params.searchExploit;

  for (let i = 0; i < exploreCount; i++) {
    onProgress(`Eksploracja ${i + 1}/${exploreCount}`);
    const cfg = randomDesign(rand);
    const evaluated = evaluateConfig(cfg, { ...params, seedBase: params.seedBase + 1000 + i * 37 });
    all.push(evaluated);
    await sleep(0);
  }

  for (let i = 0; i < exploitCount; i++) {
    const ordered = [...all].sort(compareEvaluations);
    const elite = ordered.slice(0, Math.max(3, Math.ceil(ordered.length * 0.2)));
    const parent = elite[Math.floor(rand() * elite.length)];
    onProgress(`Eksploatacja ${i + 1}/${exploitCount}`);
    const cfg = mutateDesign(parent.cfg, rand);
    const evaluated = evaluateConfig(cfg, { ...params, seedBase: params.seedBase + 5000 + i * 53 });
    all.push(evaluated);
    await sleep(0);
  }

  const ordered = [...all].sort(compareEvaluations);
  const pareto = computeParetoFront(all).sort(compareEvaluations);
  return {
    all: ordered,
    pareto,
    best: ordered[0],
  };
}

// -------------------------
// Validation & ablation
// -------------------------

function runInvariantTests() {
  const cases = [];

  // Legacy overspend should be possible here.
  const bids1 = [
    { id: 1, type: "individual", maxP: 50, budget: 100, privateValue: 60 },
    { id: 2, type: "individual", maxP: 50, budget: 100, privateValue: 60 },
    { id: 3, type: "individual", maxP: 50, budget: 100, privateValue: 60 },
  ];
  const cfg1 = { ...VALIDATED_BASE, minPrice: 30, numFractions: 10 };
  const legacy1 = runAuctionLegacy(bids1, 10, { ...cfg1, engineVersion: "legacy" });
  const validated1 = runAuctionValidated(bids1, 10, { ...cfg1, engineVersion: "validated" });
  cases.push({
    name: "Budget feasibility",
    ok: validated1.al.every(a => a.cost <= a.budget),
    detail: `legacy overspend=${legacy1.al.some(a => a.cost > a.budget) ? "yes" : "no"}, validated overspend=${validated1.al.some(a => a.cost > a.budget) ? "yes" : "no"}`
  });

  const originalParityBids = [
    { id: 1, type: "individual", maxP: 20, budget: 100, privateValue: 30 },
    { id: 2, type: "speculator", maxP: 10000, budget: 5, privateValue: 30 },
  ];
  const originalParity = runAuctionLegacy(originalParityBids, 10, { ...LEGACY_BASE, minPrice: 10, numFractions: 10 });
  cases.push({
    name: "Legacy mirrors original Python allocation",
    ok: originalParity.ok && originalParity.fp === 10.4 && originalParity.al.find(a => a.id === 2)?.shares === 10,
    detail: `fp=${originalParity.fp}, bidder2 shares=${originalParity.al.find(a => a.id === 2)?.shares || 0}`
  });

  const clearingBackoff = runAuctionValidated(
    [{ id: 1, type: "individual", maxP: 100, budget: 105, privateValue: 30 }],
    10,
    { ...VALIDATED_BASE, minPrice: 10, numFractions: 10, stepType: "linear" }
  );
  cases.push({
    name: "Validated clearing backs off to full sale",
    ok: clearingBackoff.cleared && clearingBackoff.tot === 10 && clearingBackoff.al.every(a => a.cost <= a.budget),
    detail: `fp=${clearingBackoff.fp}, sold=${clearingBackoff.tot}/10`
  });

  const bids2 = [
    { id: 1, type: "institutional", maxP: 100, budget: 1000, privateValue: 120 },
    { id: 2, type: "individual", maxP: 80, budget: 100, privateValue: 90 },
    { id: 3, type: "speculator", maxP: 80, budget: 100, privateValue: 90 },
  ];
  const cfg2 = { ...VALIDATED_BASE, minPrice: 10, numFractions: 20, maxConcentration: 0.4 };
  const result2 = runAuctionValidated(bids2, 20, cfg2);
  const maxCap = Math.floor(20 * 0.4);
  cases.push({
    name: "Concentration cap",
    ok: result2.al.every(a => a.shares <= maxCap),
    detail: `max shares=${Math.max(...result2.al.map(a => a.shares), 0)}, cap=${maxCap}`
  });

  cases.push({
    name: "Share conservation",
    ok: result2.tot <= 20 && result2.al.reduce((s, a) => s + a.shares, 0) === result2.tot,
    detail: `sold=${result2.tot}, requested max=20`
  });

  const fairness = fairnessByType([{ type: "institutional", shares: 20 }, { type: "redteam", shares: 40 }]);
  cases.push({
    name: "Fairness ignores Red Team in FI",
    ok: fairness < 1 && fairness === fairnessByType([{ type: "institutional", shares: 20 }]),
    detail: `market-only fairness=${round3(fairness)}`
  });

  const legacyGranularity = enforceGranularityPolicy({ ...LEGACY_BASE, numFractions: 100 });
  const validatedGranularity = enforceGranularityPolicy({ ...VALIDATED_BASE, numFractions: 100 });
  cases.push({
    name: "Granularity policy",
    ok: legacyGranularity.numFractions === 100 && validatedGranularity.numFractions === MIN_VALIDATED_FRACTIONS,
    detail: `legacy S=${legacyGranularity.numFractions}, validated S=${validatedGranularity.numFractions}`
  });

  return {
    passed: cases.filter(x => x.ok).length,
    total: cases.length,
    cases,
  };
}

async function runAblation(params, onProgress) {
  const outputs = {};
  const settings = {
    alpha: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    numFractions: [1000, 2500, 5000, 10000],
    allocationRule: ["proportional", "priority", "equal", "hybrid"],
    stepType: ["linear", "exponential", "adaptive"],
    maxConcentration: [0.1, 0.2, 0.3, 0.5, 0.7, 1.0],
  };

  for (const [param, values] of Object.entries(settings)) {
    outputs[param] = [];
    for (let i = 0; i < values.length; i++) {
      onProgress(`Ablacja ${param}: ${values[i]}`);
      const cfg = { ...VALIDATED_BASE, [param]: values[i] };
      const evaluated = evaluateConfig(cfg, { ...params, seedBase: params.seedBase + 9000 + i * 71 });
      outputs[param].push({ v: values[i], ...evaluated });
      await sleep(0);
    }
  }

  return outputs;
}

function learningRoundGrid(current) {
  return [...new Set([0, 40, 80, 120, 160, 220, current])]
    .filter(v => v >= 0)
    .sort((a, b) => a - b);
}

function metricImprovement(validatedMean, redesignMean, key) {
  const delta = key === "eg"
    ? validatedMean[key] - redesignMean[key]
    : redesignMean[key] - validatedMean[key];
  return round3(delta);
}

async function runLearningCurve(params, redesignCfg, onProgress) {
  const rows = [];
  const values = learningRoundGrid(params.roundsLearn);

  for (let i = 0; i < values.length; i++) {
    const roundsLearn = values[i];
    onProgress(`Krzywa uczenia T_learn=${roundsLearn}`);
    const curveParams = {
      ...params,
      roundsLearn,
      seedBase: params.seedBase + 12000 + i * 97,
    };
    const validated = evaluateConfig(VALIDATED_BASE, curveParams);
    const redesign = evaluateConfig(redesignCfg, curveParams);
    const improvement = {};
    ["rr", "ae", "eg", "cr", "fi"].forEach(key => {
      improvement[key] = metricImprovement(validated.mean, redesign.mean, key);
    });

    rows.push({
      v: roundsLearn,
      roundsLearn,
      validated,
      redesign,
      improvement,
      scoreDelta: round3(redesign.score - validated.score),
      selectionDelta: round3(redesign.selectionScore - validated.selectionScore),
    });
    await sleep(0);
  }

  return {
    rows,
    bestBySelectionDelta: [...rows].sort((a, b) => b.selectionDelta - a.selectionDelta)[0],
  };
}

// -------------------------
// Experiment pipeline
// -------------------------

async function runFullExperiment(input, onProgress) {
  const testReport = runInvariantTests();
  onProgress("Walidacja silnika zakończona.");

  const legacy = evaluateConfig(LEGACY_BASE, input);
  onProgress("RTZ v1.0 legacy gotowe.");
  await sleep(0);

  const validated = evaluateConfig(VALIDATED_BASE, { ...input, seedBase: input.seedBase + 200 });
  onProgress("RTZ v1.1 validated gotowe.");
  await sleep(0);

  const redesign = await searchRedesign(input, msg => onProgress(`Optymalizacja: ${msg}`));
  onProgress("RTZ v2.0 redesign gotowe.");
  await sleep(0);

  const ablation = await runAblation({ ...input, seedBase: input.seedBase + 400 }, msg => onProgress(msg));
  onProgress("Ablacja zakończona.");
  await sleep(0);

  const learningCurve = await runLearningCurve(
    { ...input, seedBase: input.seedBase + 700 },
    redesign.best.cfg,
    msg => onProgress(msg)
  );
  onProgress("Krzywa uczenia zakończona.");
  await sleep(0);

  return {
    inputs: input,
    validation: testReport,
    legacy,
    validated,
    redesign,
    ablation,
    learningCurve,
    generatedAt: new Date().toISOString(),
  };
}

// -------------------------
// Exports
// -------------------------

function buildCSV(data) {
  const { legacy, validated, redesign } = data;
  const best = redesign.best;
  let csv = "comparison,metric,mean,sd,rawScore,selectionScore,targetHits\n";

  [["legacy", legacy], ["validated", validated], ["v2_best", best]].forEach(([name, entry]) => {
    ["rr", "ae", "eg", "cr", "fi"].forEach(metric => {
      csv += `${name},${metric},${entry.mean[metric]},${entry.sd[metric]},${entry.score},${entry.selectionScore},${entry.targetHits}\n`;
    });
  });

  csv += "\npareto_rank,alpha,numFractions,allocationRule,stepType,maxConcentration,rr,ae,eg,cr,fi,rawScore,selectionScore,targetHits\n";
  data.redesign.pareto.forEach((entry, idx) => {
    csv += `${idx + 1},${entry.cfg.alpha},${entry.cfg.numFractions},${entry.cfg.allocationRule},${entry.cfg.stepType},${entry.cfg.maxConcentration},${entry.mean.rr},${entry.mean.ae},${entry.mean.eg},${entry.mean.cr},${entry.mean.fi},${entry.score},${entry.selectionScore},${entry.targetHits}\n`;
  });

  Object.entries(data.ablation).forEach(([param, rows]) => {
    csv += `\nABLATION_${param},value,rr,ae,eg,cr,fi,rawScore,selectionScore,targetHits\n`;
    rows.forEach(row => {
      csv += `${param},${row.v},${row.mean.rr},${row.mean.ae},${row.mean.eg},${row.mean.cr},${row.mean.fi},${row.score},${row.selectionScore},${row.targetHits}\n`;
    });
  });

  if (data.learningCurve?.rows?.length) {
    csv += "\nLEARNING_CURVE,T_learn,validated_rr,validated_ae,validated_eg,validated_cr,validated_fi,v2_rr,v2_ae,v2_eg,v2_cr,v2_fi,delta_rr,delta_ae,delta_eg_improvement,delta_cr,delta_fi,scoreDelta,selectionDelta\n";
    data.learningCurve.rows.forEach(row => {
      csv += `learning,${row.roundsLearn},${row.validated.mean.rr},${row.validated.mean.ae},${row.validated.mean.eg},${row.validated.mean.cr},${row.validated.mean.fi},${row.redesign.mean.rr},${row.redesign.mean.ae},${row.redesign.mean.eg},${row.redesign.mean.cr},${row.redesign.mean.fi},${row.improvement.rr},${row.improvement.ae},${row.improvement.eg},${row.improvement.cr},${row.improvement.fi},${row.scoreDelta},${row.selectionDelta}\n`;
    });
  }

  return csv;
}

function buildLaTeX(data) {
  const { legacy, validated, redesign } = data;
  const best = redesign.best;
  const delta = (a, b) => round3(a - b);
  const rows = ["rr", "ae", "eg", "cr", "fi"];

  const texLines = [
    String.raw`\begin{table}[h]`,
    String.raw`\centering`,
    String.raw`\caption{From RTZ v1.0 legacy to RTZ v2.0 redesign}`,
    String.raw`\label{tab:rtz-comparison}`,
    String.raw`\begin{tabular}{lccc}`,
    String.raw`\toprule`,
    String.raw`Metric & v1.0 legacy & v1.1 validated & v2.0 redesign \\`,
    String.raw`\midrule`,
  ];

  rows.forEach(k => {
    texLines.push(String.raw`${METRIC_LABELS[k]} & ${legacy.mean[k].toFixed(3)} & ${validated.mean[k].toFixed(3)} & ${best.mean[k].toFixed(3)} \\`);
  });
  texLines.push(String.raw`\midrule`);
  texLines.push(String.raw`Weighted score & ${legacy.score.toFixed(3)} & ${validated.score.toFixed(3)} & ${best.score.toFixed(3)} \\`);
  texLines.push(String.raw`Fair-aware selection & ${legacy.selectionScore.toFixed(3)} & ${validated.selectionScore.toFixed(3)} & ${best.selectionScore.toFixed(3)} \\`);
  texLines.push(String.raw`\bottomrule`);
  texLines.push(String.raw`\end{tabular}`);
  texLines.push(String.raw`\\[6pt]\small v2.0 configuration: $\alpha=${best.cfg.alpha}$, $S=${best.cfg.numFractions}$, allocation=$\text{${best.cfg.allocationRule}}$, step=$\text{${best.cfg.stepType}}$, $c_{max}=${best.cfg.maxConcentration}$. FI is computed on market types only (individual, institutional, speculator). Fairness-preferred selection requires RR $\geq 0.90$.`);
  texLines.push(String.raw`\end{table}`);
  texLines.push("");
  texLines.push("% Legacy to validated deltas");
  rows.forEach(k => {
    texLines.push(`% ${k}: validated - legacy = ${delta(validated.mean[k], legacy.mean[k]).toFixed(3)}; v2 - validated = ${delta(best.mean[k], validated.mean[k]).toFixed(3)}`);
  });

  return `${texLines.join("\n")}\n`;
}

function buildArticleNotes(data) {
  const best = data.redesign.best;
  const validationPass = `${data.validation.passed}/${data.validation.total}`;
  const improvedOverValidated = ["rr", "ae", "cr", "fi"].filter(k => best.mean[k] > data.validated.mean[k]).length
    + (best.mean.eg < data.validated.mean.eg ? 1 : 0);
  const learningBest = data.learningCurve?.bestBySelectionDelta;

  return [
    "ARTYKUŁ — AKTUALIZACJA STRUKTURY",
    "1. Wprowadzić trzy poziomy wersjonowania: RTZ v1.0 legacy, RTZ v1.1 validated, RTZ v2.0 redesign.",
    `2. W sekcji metodologii dopisać walidację symulatora: ${validationPass} testów niezmienników przeszło.`,
    "3. Uczciwie nazwać obecną populację agentów jako heterogenicznych agentów adaptacyjnych opartych o bandit learning; dopiero kolejny etap to pełny deep RL.",
    "4. Wyniki główne raportować względem RTZ v1.1 validated, a RTZ v1.0 legacy zostawić jako baseline implementacyjny.",
    "5. Fairness Index liczyć wyłącznie dla typów rynku: individual, institutional, speculator. Red Team pozostaje wyłącznie w EG / exploitability diagnostics.",
    `6. Najlepsza konfiguracja v2.0: alpha=${best.cfg.alpha}, S=${best.cfg.numFractions}, R=${best.cfg.allocationRule}, step=${best.cfg.stepType}, c_max=${best.cfg.maxConcentration}.`,
    `7. v2.0 poprawia wynik zagregowany względem v1.1 na ${improvedOverValidated}/5 metrykach wg obecnej symulacji, a wybór finalny jest fairness-aware z twardą barierą RR ≥ 0.90 (selection score ${best.selectionScore.toFixed(3)}).`,
    "8. Interpretować spadek RR poniżej 0.90 jako konfigurację niedopuszczalną dla fairness-preferred selection, nawet jeśli FI/EG są dobre.",
    learningBest ? `9. Krzywa uczenia: najwyższa delta selection względem validated wystąpiła przy T_learn=${learningBest.roundsLearn} (delta=${learningBest.selectionDelta.toFixed(3)}).` : "9. Krzywa uczenia nie została wygenerowana.",
    "10. Dla validated i redesign utrzymać politykę minimalnej granularności S ≥ 1000.",
    "11. Dopisać ograniczenie: obecna wersja implementuje validated fairness-aware simulator i heuristic mechanism search, a nie jeszcze pełne BOHB+MARL."
  ].join("\n");
}
function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// -------------------------
// UI
// -------------------------

function Box({ children, accent }) {
  return (
    <div
      style={{
        background: "#17171b",
        border: `1px solid ${accent || "#28282d"}`,
        borderRadius: 14,
        padding: 16,
        boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#86868f", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function HelpIcon({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      title={text}
      aria-label={text}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        borderRadius: 8,
        border: "1px solid #4a4a54",
        color: "#d8d8df",
        fontSize: 10,
        fontWeight: 800,
        cursor: "help",
        flex: "0 0 auto",
      }}
      tabIndex={0}
    >
      ?
      {open ? (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: 22,
            left: 0,
            zIndex: 100,
            width: 300,
            maxWidth: "70vw",
            padding: "9px 10px",
            borderRadius: 8,
            border: "1px solid #4a4a54",
            background: "#101014",
            color: "#f4f4f7",
            boxShadow: "0 12px 30px rgba(0,0,0,0.36)",
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            textTransform: "none",
            letterSpacing: 0,
            pointerEvents: "none",
          }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

function FormulaLine({ children }) {
  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 11,
        color: "#f0f0f4",
        background: "#111115",
        border: "1px solid #292932",
        borderRadius: 8,
        padding: "6px 8px",
        lineHeight: 1.45,
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </div>
  );
}

function Slider({ label, hint, tooltip, value, min, max, step, onChange, display }) {
  const help = tooltip || hint;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#f0f0f2", marginBottom: 4 }}>
        <span title={help}>{label}</span>
        <HelpIcon text={help} />
      </div>
      {hint ? <div style={{ fontSize: 11, color: "#7c7c86", marginBottom: 6, lineHeight: 1.4 }}>{hint}</div> : null}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "#8b7cf6" }}
        />
        <div style={{ width: 70, textAlign: "right", fontWeight: 700, color: "#f6f6f7" }}>{display}</div>
      </div>
    </div>
  );
}

function MetricCard({ label, mean, sd, good, formula, help }) {
  const tooltip = [formula, help].filter(Boolean).join("\n");
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        background: good ? "rgba(46, 204, 113, 0.08)" : "rgba(231, 76, 60, 0.08)",
        borderLeft: `4px solid ${good ? "#2ecc71" : "#e74c3c"}`,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "#a9a9b1" }}>
        <span title={tooltip}>{label}</span>
        <HelpIcon text={tooltip} />
      </div>
      {formula ? <div style={{ marginTop: 6, fontSize: 10, color: "#bdbdc6", lineHeight: 1.35, overflowWrap: "anywhere" }}>{formula}</div> : null}
      <div style={{ fontSize: 22, color: "#ffffff", fontWeight: 700 }}>{(mean * 100).toFixed(1)}%</div>
      <div style={{ fontSize: 11, color: "#8d8d97" }}>sd {(sd * 100).toFixed(1)} pp</div>
    </div>
  );
}

function MathHints() {
  const rows = ["rr", "ae", "eg", "cr", "fi"].map(key => [METRIC_LABELS[key], METRIC_DETAILS[key]]);

  return (
    <Box>
      <Label>Matematyka metryk</Label>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map(([name, detail]) => (
          <div key={name} style={{ display: "grid", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", fontWeight: 800 }}>
              <span>{name}</span>
              <HelpIcon text={`${detail.formula}\n${detail.target}\n${detail.help}`} />
            </div>
            <FormulaLine>{detail.formula}</FormulaLine>
            <div style={{ fontSize: 11, color: "#a8a8b0", lineHeight: 1.5 }}>{detail.target}. {detail.help}</div>
          </div>
        ))}
        <div style={{ display: "grid", gap: 5, paddingTop: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", fontWeight: 800 }}>
            <span>Weighted score i selection</span>
            <HelpIcon text={`${SELECTION_DETAILS.formula}\n${SELECTION_DETAILS.selectionFormula}\n${SELECTION_DETAILS.help}`} />
          </div>
          <FormulaLine>{SELECTION_DETAILS.formula}</FormulaLine>
          <FormulaLine>{SELECTION_DETAILS.selectionFormula}</FormulaLine>
          <div style={{ fontSize: 11, color: "#a8a8b0", lineHeight: 1.5 }}>{SELECTION_DETAILS.help}</div>
        </div>
      </div>
    </Box>
  );
}

function ParameterHints() {
  const rows = [
    ["T_learn", "liczba rund aktualizacji strategii", "Qₐ ← Qₐ + (r − Qₐ) ÷ nₐ", "Zwiększać przy learning-limited, czyli gdy CR/EG lub krzywa uczenia sugerują niedouczenie agentów."],
    ["T_eval", "liczba rund pomiaru po uczeniu", "metric = (1 ÷ Tₑᵥₐₗ) · ∑ₜ metricₜ", "Zwiększać przy wynikach blisko progów albo przy wysokim szumie, bo redukuje wariancję pomiaru po treningu."],
    ["reps", "liczba niezależnych seedów na konfigurację", "x̄ = (1 ÷ reps) · ∑ᵣ xᵣ,  sd = √(∑ᵣ(xᵣ − x̄)² ÷ (reps − 1))", "Zwiększać, gdy interesuje stabilność między populacjami i losowaniami."],
    ["seed window", "okno losowości dla populacji, uczenia i searchu", "seedBaseₖ₊₁ = seedBaseₖ + 1 000 003;  seedSearchₖ₊₁ = seedSearchₖ + 104 729", "Autopilot przesuwa seedy w każdej rekomendacji, żeby nie powtarzać identycznej trajektorii."],
    ["explore/exploit", "budżet searchu mechanizmu", "Nᶜᵃⁿᵈ = searchExplore + searchExploit", "Zwiększać przy search-limited; to szuka lepszej konfiguracji mechanizmu, nie wydłuża treningu agentów."],
    ["autopilot", "pętla badawcza", "runₖ → interpretacjaₖ → parametryₖ₊₁ → seedₖ₊₁ → runₖ₊₁", "Startuje od aktualnych suwaków, potem sam stosuje rekomendacje aż do limitu albo zatrzymania."],
  ];

  return (
    <Box>
      <Label>Podpowiedzi parametrów</Label>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map(([name, shortText, formula, text]) => (
          <div key={name} style={{ display: "grid", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", fontWeight: 800 }}>
              <span>{name}: {shortText}</span>
              <HelpIcon text={`${formula}\n${text}`} />
            </div>
            <FormulaLine>{formula}</FormulaLine>
            <div style={{ fontSize: 11, color: "#a8a8b0", lineHeight: 1.5 }}>{text}</div>
          </div>
        ))}
      </div>
    </Box>
  );
}

function SummaryRow({ label, a, b, c, formula, help }) {
  const tooltip = [formula, help].filter(Boolean).join("\n");
  return (
    <tr style={{ borderBottom: "1px solid #25252b" }}>
      <td style={tdStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span title={tooltip}>{label}</span>
          <HelpIcon text={tooltip} />
        </div>
        {formula ? <div style={{ marginTop: 4, fontSize: 10, color: "#8f8f98", lineHeight: 1.35 }}>{formula}</div> : null}
      </td>
      <td style={tdStyle}>{a}</td>
      <td style={tdStyle}>{b}</td>
      <td style={tdStyle}>{c}</td>
    </tr>
  );
}

function StatusPill({ ok, text }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        borderRadius: 999,
        background: ok ? "rgba(46,204,113,0.12)" : "rgba(231,76,60,0.12)",
        color: ok ? "#2ecc71" : "#ff7f7f",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ok ? "#2ecc71" : "#ff7f7f", display: "inline-block" }} />
      {text}
    </span>
  );
}

function SimpleLineChart({ rows, metricKey, title }) {
  const width = 420;
  const height = 150;
  const pad = { t: 14, r: 10, b: 24, l: 28 };
  const chartW = width - pad.l - pad.r;
  const chartH = height - pad.t - pad.b;
  const points = rows.map((row, i) => ({
    x: pad.l + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * chartW),
    y: pad.t + chartH - row.mean[metricKey] * chartH,
    label: String(row.v),
  }));
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const colors = { rr: "#8b7cf6", ae: "#4aa7ff", eg: "#ff6b6b", cr: "#f0a030", fi: "#2ecc71" };

  return (
    <div>
      <div style={{ fontSize: 12, color: "#ddd", marginBottom: 4 }}>{title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 160, background: "#111115", borderRadius: 10 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((g, idx) => (
          <g key={idx}>
            <line x1={pad.l} x2={pad.l + chartW} y1={pad.t + chartH - g * chartH} y2={pad.t + chartH - g * chartH} stroke="#2a2a31" strokeWidth="1" />
            <text x={pad.l - 6} y={pad.t + chartH - g * chartH + 4} fill="#767680" fontSize="9" textAnchor="end">
              {(g * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke={colors[metricKey]} strokeWidth="2.5" />
        {points.map((p, idx) => (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="3.5" fill={colors[metricKey]} />
            <text x={p.x} y={height - 7} fill="#8a8a93" fontSize="9" textAnchor="middle">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function formatDeltaPct(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)} pp`;
}

function stepUp(value, step, max) {
  return Math.min(max, value + step);
}

function advanceSeedWindow(next, params) {
  next.seedBase = (params.seedBase ?? experimentDefaults.seedBase) + SEED_BASE_STEP;
  next.seedSearch = (params.seedSearch ?? experimentDefaults.seedSearch) + SEED_SEARCH_STEP;
}

function buildNextExperimentPlan(data) {
  const best = data.redesign.best;
  const validated = data.validated;
  const params = data.inputs;
  const next = { ...params };
  const diagnoses = new Set();
  const reasons = [];
  const learningRows = data.learningCurve?.rows || [];
  const learningBest = data.learningCurve?.bestBySelectionDelta;
  const maxLearning = learningRows.length ? Math.max(...learningRows.map(row => row.roundsLearn)) : 0;
  const nearDecisionBoundary =
    Math.abs(best.mean.rr - 0.9) <= 0.03 ||
    Math.abs(best.mean.cr - 0.85) <= 0.05 ||
    Math.abs(best.mean.fi - 0.6) <= 0.05 ||
    Math.abs(best.mean.eg - 0.15) <= 0.04;
  const noisy = best.sd.rr > 0.04 || best.sd.cr > 0.06 || best.sd.fi > 0.06 || best.sd.eg > 0.04;

  if (!METRIC_TARGETS.rr(best.mean.rr)) {
    diagnoses.add("revenue-constrained");
    diagnoses.add("search-limited");
    next.searchExplore = stepUp(next.searchExplore, 4, 18);
    next.searchExploit = stepUp(next.searchExploit, 4, 24);
    next.roundsEval = stepUp(next.roundsEval, 20, 140);
    reasons.push(`M1 RR v2.0=${(best.mean.rr * 100).toFixed(1)}% jest poniżej bariery 90%, więc kolejny run zwiększa search i T_eval.`);
  }

  if (best.selectionScore < validated.selectionScore || best.targetHits < validated.targetHits) {
    diagnoses.add("search-limited");
    next.searchExplore = stepUp(next.searchExplore, 2, 18);
    next.searchExploit = stepUp(next.searchExploit, 2, 24);
    reasons.push(`v2.0 nie przebija validated wystarczająco stabilnie, więc kolejny run poszerza search.`);
  }

  if (!METRIC_TARGETS.cr(best.mean.cr) || !METRIC_TARGETS.eg(best.mean.eg)) {
    diagnoses.add("learning-limited");
    next.roundsLearn = stepUp(next.roundsLearn, 20, 240);
    reasons.push(`CR albo EG nie spełnia celu, więc kolejny run wydłuża T_learn.`);
  }

  if (noisy || nearDecisionBoundary) {
    diagnoses.add("evaluation-noise-limited");
    next.roundsEval = stepUp(next.roundsEval, 20, 140);
    if (noisy || next.roundsEval >= 140) next.reps = stepUp(next.reps, 1, 9);
    reasons.push("Wyniki są zaszumione albo blisko progów decyzyjnych, więc kolejny run zwiększa T_eval i ewentualnie reps.");
  }

  if (learningBest && learningBest.roundsLearn > params.roundsLearn && learningBest.selectionDelta > 0) {
    diagnoses.add("learning-limited");
    next.roundsLearn = Math.min(240, learningBest.roundsLearn);
    reasons.push(`Krzywa uczenia wskazuje lepszą deltę selection przy T_learn=${learningBest.roundsLearn}.`);
  } else if (learningBest && learningBest.roundsLearn === maxLearning && maxLearning >= params.roundsLearn && learningBest.selectionDelta > 0) {
    diagnoses.add("learning-limited");
    next.roundsLearn = stepUp(next.roundsLearn, 40, 240);
    reasons.push("Najlepszy punkt krzywej uczenia jest na górnej granicy siatki, więc warto sprawdzić dłuższe uczenie.");
  }

  if (!reasons.length) {
    diagnoses.add("stable");
    next.reps = stepUp(next.reps, 1, 9);
    next.roundsEval = stepUp(next.roundsEval, 20, 140);
    reasons.push("Wynik spełnia główne kryteria; kolejny run powinien potwierdzić stabilność większą liczbą ewaluacji.");
  }

  advanceSeedWindow(next, params);
  reasons.push(`Kolejny run użyje nowego okna seedów: seedBase=${next.seedBase}, seedSearch=${next.seedSearch}, żeby uniknąć powtórzenia identycznej trajektorii.`);

  return {
    next,
    diagnoses: [...diagnoses],
    reasons,
    changes: Object.entries(next)
      .filter(([key, value]) => value !== params[key])
      .map(([key, value]) => ({ key, from: params[key], to: value })),
    changed: Object.keys(next).some(key => next[key] !== params[key]),
  };
}

function summarizeRun(result, index) {
  const best = result.redesign.best;
  return {
    id: index,
    generatedAt: result.generatedAt,
    inputs: result.inputs,
    rr: best.mean.rr,
    ae: best.mean.ae,
    eg: best.mean.eg,
    cr: best.mean.cr,
    fi: best.mean.fi,
    score: best.score,
    selectionScore: best.selectionScore,
    targetHits: best.targetHits,
    cfg: best.cfg,
  };
}

function LearningCurveTable({ data }) {
  const rows = data?.rows || [];
  if (!rows.length) return null;

  return (
    <Box>
      <Label>Rundy uczenia vs poprawa metryk</Label>
      <div style={{ fontSize: 12, color: "#9696a0", lineHeight: 1.6, marginBottom: 10 }}>
        Delta jest liczona względem v1.1 validated. Dla EG dodatnia wartość oznacza spadek exploitation gap.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #35353b", color: "#9f9fa8", fontSize: 12 }}>
              <th style={thStyle}>T_learn</th>
              <th style={thStyle}>Δ RR</th>
              <th style={thStyle}>Δ AE</th>
              <th style={thStyle}>Δ EG</th>
              <th style={thStyle}>Δ CR</th>
              <th style={thStyle}>Δ FI</th>
              <th style={thStyle}>Δ selection</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.roundsLearn} style={{ borderBottom: "1px solid #25252b" }}>
                <td style={tdStyle}>{row.roundsLearn}</td>
                <td style={tdStyle}>{formatDeltaPct(row.improvement.rr)}</td>
                <td style={tdStyle}>{formatDeltaPct(row.improvement.ae)}</td>
                <td style={tdStyle}>{formatDeltaPct(row.improvement.eg)}</td>
                <td style={tdStyle}>{formatDeltaPct(row.improvement.cr)}</td>
                <td style={tdStyle}>{formatDeltaPct(row.improvement.fi)}</td>
                <td style={tdStyle}>{row.selectionDelta > 0 ? "+" : ""}{row.selectionDelta.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.bestBySelectionDelta ? (
        <div style={{ fontSize: 12, color: "#c8c8cf", lineHeight: 1.6, marginTop: 10 }}>
          Najwyższa delta selection: <strong style={{ color: "#fff" }}>T_learn={data.bestBySelectionDelta.roundsLearn}</strong>, {data.bestBySelectionDelta.selectionDelta > 0 ? "+" : ""}{data.bestBySelectionDelta.selectionDelta.toFixed(3)}.
        </div>
      ) : null}
    </Box>
  );
}

function ExperimentHistory({ rows }) {
  if (!rows.length) return null;

  return (
    <Box>
      <Label>Historia iteracji</Label>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #35353b", color: "#9f9fa8", fontSize: 12 }}>
              <th style={thStyle}>Run</th>
              <th style={thStyle}>T_learn</th>
              <th style={thStyle}>T_eval</th>
              <th style={thStyle}>reps</th>
              <th style={thStyle}>seed</th>
              <th style={thStyle}>RR</th>
              <th style={thStyle}>CR</th>
              <th style={thStyle}>FI</th>
              <th style={thStyle}>selection</th>
              <th style={thStyle}>v2.0 config</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} style={{ borderBottom: "1px solid #25252b" }}>
                <td style={tdStyle}>#{row.id}</td>
                <td style={tdStyle}>{row.inputs.roundsLearn}</td>
                <td style={tdStyle}>{row.inputs.roundsEval}</td>
                <td style={tdStyle}>{row.inputs.reps}</td>
                <td style={tdStyle}>{row.inputs.seedBase}</td>
                <td style={tdStyle}>{(row.rr * 100).toFixed(1)}%</td>
                <td style={tdStyle}>{(row.cr * 100).toFixed(1)}%</td>
                <td style={tdStyle}>{(row.fi * 100).toFixed(1)}%</td>
                <td style={tdStyle}>{row.selectionScore.toFixed(3)}</td>
                <td style={tdStyle}>α={row.cfg.alpha}, S={row.cfg.numFractions}, {row.cfg.allocationRule}, {row.cfg.stepType}, c={row.cfg.maxConcentration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Box>
  );
}

function Results({ data, onApplyParams, onApplyAndRun, onAutoRun, autoRunLimit }) {
  const best = data.redesign.best;
  const pareto = data.redesign.pareto;
  const noteText = buildArticleNotes(data);
  const nextPlan = buildNextExperimentPlan(data);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Box accent="#2ecc7140">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <Label>Najważniejszy wynik</Label>
            <div style={{ fontSize: 22, color: "#fff", fontWeight: 700 }}>RTZ v1.0 → v1.1 → v2.0</div>
            <div style={{ fontSize: 12, color: "#90909a", marginTop: 4 }}>
              historyczny baseline, poprawny symulator i zoptymalizowany redesign mechanizmu
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusPill ok text={`Testy: ${data.validation.passed}/${data.validation.total}`} />
            <StatusPill ok={best.score >= data.validated.score} text={`raw ${best.score.toFixed(3)}`} />
            <StatusPill ok={best.selectionScore >= data.validated.selectionScore} text={`selection ${best.selectionScore.toFixed(3)}`} />
          </div>
        </div>

        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #35353b", color: "#9f9fa8", fontSize: 12 }}>
                <th style={thStyle}>Metryka</th>
                <th style={thStyle}>v1.0 legacy</th>
                <th style={thStyle}>v1.1 validated</th>
                <th style={thStyle}>v2.0 redesign</th>
              </tr>
            </thead>
            <tbody>
              {["rr", "ae", "eg", "cr", "fi"].map(key => (
                <SummaryRow
                  key={key}
                  label={METRIC_LABELS[key]}
                  formula={METRIC_DETAILS[key].formula}
                  help={`${METRIC_DETAILS[key].target}. ${METRIC_DETAILS[key].help}`}
                  a={`${(data.legacy.mean[key] * 100).toFixed(1)}% ± ${(data.legacy.sd[key] * 100).toFixed(1)}`}
                  b={`${(data.validated.mean[key] * 100).toFixed(1)}% ± ${(data.validated.sd[key] * 100).toFixed(1)}`}
                  c={`${(best.mean[key] * 100).toFixed(1)}% ± ${(best.sd[key] * 100).toFixed(1)}`}
                />
              ))}
              <SummaryRow
                label="Weighted score"
                formula={SELECTION_DETAILS.formula}
                help={SELECTION_DETAILS.help}
                a={data.legacy.score.toFixed(3)}
                b={data.validated.score.toFixed(3)}
                c={best.score.toFixed(3)}
              />
              <SummaryRow
                label="Fair-aware selection"
                formula={SELECTION_DETAILS.selectionFormula}
                help={SELECTION_DETAILS.help}
                a={data.legacy.selectionScore.toFixed(3)}
                b={data.validated.selectionScore.toFixed(3)}
                c={best.selectionScore.toFixed(3)}
              />
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#c8c8cf", lineHeight: 1.7 }}>
          <div><strong style={{ color: "#fff" }}>v2.0 config:</strong> α={best.cfg.alpha}, S={best.cfg.numFractions}, R={best.cfg.allocationRule}, step={best.cfg.stepType}, c_max={best.cfg.maxConcentration}</div>
          <div><strong style={{ color: "#fff" }}>Selection:</strong> fairness-aware ranking, RR ≥ 90%, FI bez Red Teamu</div>
          <div><strong style={{ color: "#fff" }}>Pareto front:</strong> {pareto.length} niezdominowanych konfiguracji</div>
        </div>
      </Box>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10 }}>
        {["rr", "ae", "eg", "cr", "fi"].map(key => (
          <MetricCard
            key={key}
            label={METRIC_LABELS[key]}
            mean={best.mean[key]}
            sd={best.sd[key]}
            good={METRIC_TARGETS[key](best.mean[key])}
            formula={METRIC_DETAILS[key].formula}
            help={`${METRIC_DETAILS[key].target}. ${METRIC_DETAILS[key].help}`}
          />
        ))}
      </div>

      <Box>
        <Label>Walidacja symulatora</Label>
        <div style={{ display: "grid", gap: 8 }}>
          {data.validation.cases.map(test => (
            <div key={test.name} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #232329", paddingBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: "#fff" }}>{test.name}</div>
                <div style={{ fontSize: 11, color: "#8f8f98" }}>{test.detail}</div>
              </div>
              <StatusPill ok={test.ok} text={test.ok ? "PASS" : "FAIL"} />
            </div>
          ))}
        </div>
      </Box>

      <Box>
        <Label>Ablacja względem v1.1 validated</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SimpleLineChart rows={data.ablation.alpha} metricKey="rr" title="alpha → Revenue Ratio" />
          <SimpleLineChart rows={data.ablation.maxConcentration} metricKey="fi" title="c_max → Fairness" />
          <SimpleLineChart rows={data.ablation.numFractions} metricKey="ae" title="S → Allocative Efficiency" />
          <SimpleLineChart rows={data.ablation.stepType} metricKey="cr" title="stepType → Completion" />
        </div>
      </Box>

      <LearningCurveTable data={data.learningCurve} />

      <Box accent="#8b7cf640">
        <Label>Następny eksperyment</Label>
        <div style={{ fontSize: 13, color: "#fff", fontWeight: 700, marginBottom: 8 }}>
          Rekomendowane parametry kolejnego przebiegu
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {nextPlan.diagnoses.map(diagnosis => (
            <StatusPill key={diagnosis} ok={diagnosis === "stable"} text={diagnosis} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, marginBottom: 10 }}>
          {[
            ["agents", nextPlan.next.nAgents],
            ["T_learn", nextPlan.next.roundsLearn],
            ["T_eval", nextPlan.next.roundsEval],
            ["reps", nextPlan.next.reps],
            ["explore", nextPlan.next.searchExplore],
            ["exploit", nextPlan.next.searchExploit],
            ["V", `${Math.round(nextPlan.next.tv / 1000)}k`],
            ["evals", `${2 + nextPlan.next.searchExplore + nextPlan.next.searchExploit + (7 + 4 + 4 + 3 + 6) + learningRoundGrid(nextPlan.next.roundsLearn).length * 2}`],
            ["seedBase", nextPlan.next.seedBase],
            ["seedSearch", nextPlan.next.seedSearch],
          ].map(([label, value]) => (
            <div key={label} style={{ background: "#111115", border: "1px solid #292932", borderRadius: 8, padding: 10 }}>
              <div style={{ color: "#86868f", fontSize: 10, textTransform: "uppercase" }}>{label}</div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {nextPlan.reasons.map(reason => (
            <div key={reason} style={{ fontSize: 12, color: "#cfcfd6", lineHeight: 1.55 }}>
              {reason}
            </div>
          ))}
        </div>
        <div style={{ background: "#111115", border: "1px solid #292932", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ color: "#86868f", fontSize: 10, textTransform: "uppercase", marginBottom: 6 }}>Uzasadnienie zmiany parametrów</div>
          {nextPlan.changes.length ? (
            <div style={{ display: "grid", gap: 4 }}>
              {nextPlan.changes.map(change => (
                <div key={change.key} style={{ fontSize: 12, color: "#d7d7dd", lineHeight: 1.5 }}>
                  <strong style={{ color: "#fff" }}>{change.key}</strong>: {String(change.from)} → {String(change.to)}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#d7d7dd", lineHeight: 1.5 }}>
              Parametry zostają bez zmian; kolejny przebieg służy potwierdzeniu stabilności wyniku na nowych seedach.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={{ ...btnSecondary, borderColor: "#8b7cf6", color: "#fff" }}
            onClick={() => onApplyParams(nextPlan.next)}
          >
            Zastosuj rekomendowane parametry
          </button>
          <button
            style={{ ...btnSecondary, borderColor: "#2ecc71", color: "#fff" }}
            onClick={() => onApplyAndRun(nextPlan.next)}
          >
            Zastosuj i uruchom
          </button>
          <button
            style={{ ...btnSecondary, borderColor: "#f0a030", color: "#fff" }}
            onClick={() => onAutoRun(nextPlan.next)}
          >
            Autopilot: {autoRunLimit} przebiegów
          </button>
        </div>
      </Box>

      <Box>
        <Label>Wnioski do artykułu</Label>
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            fontSize: 12,
            lineHeight: 1.7,
            color: "#d7d7dd",
            background: "#111115",
            padding: 14,
            borderRadius: 10,
            border: "1px solid #25252b",
          }}
        >
          {noteText}
        </pre>
      </Box>

      <Box>
        <Label>Eksport</Label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={() => downloadText(buildCSV(data), "rtz_rebuild_results.csv")}>
            Pobierz CSV
          </button>
          <button style={btnSecondary} onClick={() => downloadText(buildLaTeX(data), "rtz_rebuild_table.tex")}>
            Pobierz LaTeX
          </button>
          <button style={btnSecondary} onClick={() => downloadText(JSON.stringify(data, null, 2), "rtz_rebuild_raw.json")}>
            Pobierz JSON
          </button>
          <button style={btnSecondary} onClick={() => downloadText(noteText, "rtz_article_notes.txt")}>
            Pobierz notatki do artykułu
          </button>
        </div>
      </Box>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "8px 6px",
  fontSize: 11,
  color: "#90909a",
};
const tdStyle = {
  textAlign: "left",
  padding: "9px 6px",
  color: "#d4d4db",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
};

const btnPrimary = {
  width: "100%",
  padding: 14,
  borderRadius: 10,
  background: "#8b7cf6",
  border: "1px solid #9a8cf8",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};

const btnSecondary = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "transparent",
  border: "1px solid #33333b",
  color: "#f0f0f4",
  cursor: "pointer",
  fontSize: 12,
};

export default function App() {
  const [nAgents, setNAgents] = useState(experimentDefaults.nAgents);
  const [tv, setTv] = useState(experimentDefaults.tv);
  const [roundsLearn, setRoundsLearn] = useState(experimentDefaults.roundsLearn);
  const [roundsEval, setRoundsEval] = useState(experimentDefaults.roundsEval);
  const [reps, setReps] = useState(experimentDefaults.reps);
  const [searchExplore, setSearchExplore] = useState(experimentDefaults.searchExplore);
  const [searchExploit, setSearchExploit] = useState(experimentDefaults.searchExploit);
  const [seedBase, setSeedBase] = useState(experimentDefaults.seedBase);
  const [seedSearch, setSeedSearch] = useState(experimentDefaults.seedSearch);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("Gotowe.");
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [autoMode, setAutoMode] = useState(false);
  const [autoRunLimit, setAutoRunLimit] = useState(DEFAULT_AUTOPILOT_RUN_LIMIT);
  const stopAutoRef = useRef(false);

  const estimatedEvaluations = useMemo(() => {
    return 2 + searchExplore + searchExploit + (7 + 4 + 4 + 3 + 6) + learningRoundGrid(roundsLearn).length * 2;
  }, [roundsLearn, searchExplore, searchExploit]);

  const applyParamState = useCallback(next => {
    setNAgents(next.nAgents);
    setTv(next.tv);
    setRoundsLearn(next.roundsLearn);
    setRoundsEval(next.roundsEval);
    setReps(next.reps);
    setSearchExplore(next.searchExplore);
    setSearchExploit(next.searchExploit);
    if (typeof next.seedBase === "number") setSeedBase(next.seedBase);
    if (typeof next.seedSearch === "number") setSeedSearch(next.seedSearch);
  }, []);

  const buildRunParams = useCallback((overrides = {}) => ({
    nAgents,
    tv,
    roundsLearn,
    roundsEval,
    reps,
    seedBase,
    seedSearch,
    searchExplore,
    searchExploit,
    ...overrides,
  }), [nAgents, tv, roundsLearn, roundsEval, reps, seedBase, seedSearch, searchExplore, searchExploit]);

  const handleRun = useCallback(async function runExperiment(overrides = null, autoRemaining = 0) {
    const params = buildRunParams(overrides || {});
    if (overrides) applyParamState(params);
    if (autoRemaining > 0) setAutoMode(true);
    setBusy(true);
    setData(null);
    setPhase(autoRemaining > 0 ? `Autopilot: start, pozostałe przebiegi po tym: ${autoRemaining}` : "Start...");

    try {
      const result = await runFullExperiment(params, setPhase);
      setData(result);
      setHistory(prev => [summarizeRun(result, (prev[0]?.id || 0) + 1), ...prev].slice(0, 8));

      const nextPlan = buildNextExperimentPlan(result);
      if (autoRemaining > 0 && !stopAutoRef.current) {
        setPhase(`Autopilot: kolejny przebieg za chwilę, pozostało ${autoRemaining}.`);
        window.setTimeout(() => {
          void runExperiment(nextPlan.next, autoRemaining - 1);
        }, 250);
      } else {
        setAutoMode(false);
        setPhase(autoRemaining > 0 && stopAutoRef.current ? "Autopilot zatrzymany." : "Gotowe.");
      }
    } catch (err) {
      setAutoMode(false);
      setPhase(`Błąd: ${err.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [applyParamState, buildRunParams]);

  const handleApplyParams = useCallback(next => {
    applyParamState(next);
    setPhase("Zastosowano rekomendowane parametry. Uruchom kolejny eksperyment.");
  }, [applyParamState]);

  const handleApplyAndRun = useCallback(next => {
    void handleRun(next);
  }, [handleRun]);

  const handleAutoRun = useCallback(next => {
    stopAutoRef.current = false;
    void handleRun(next, Math.max(0, autoRunLimit - 1));
  }, [autoRunLimit, handleRun]);

  const handleStartAutopilot = useCallback(() => {
    stopAutoRef.current = false;
    void handleRun(null, Math.max(0, autoRunLimit - 1));
  }, [autoRunLimit, handleRun]);

  const handleStopAuto = useCallback(() => {
    stopAutoRef.current = true;
    setAutoMode(false);
    setPhase("Zatrzymywanie autopilota po bieżącym przebiegu.");
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f12",
        color: "#f7f7fa",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "20px 16px 40px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#8b7cf6", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            RTZ Auction Lab
          </div>
          <h1 style={{ fontSize: 30, lineHeight: 1.15, margin: 0 }}>
            Rebuild: legacy baseline, validated simulator, v2.0 redesign
          </h1>
          <div style={{ marginTop: 8, color: "#9b9ba6", maxWidth: 900, lineHeight: 1.65 }}>
            Jedna aplikacja do trzech zadań: zrekonstruować punkt startowy v1.0, zbudować poprawny symulator v1.1 oraz
            uruchomić redesign mechanizmu v2.0 na adaptacyjnych agentach z replikacjami, walidacją i eksportem wyników.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <Box>
              <Label>Parametry eksperymentu</Label>
              <Slider label="Liczba agentów" hint="Populacja heterogenicznych agentów" tooltip="nAgents: liczba agentów w jednej populacji. Więcej agentów zwiększa różnorodność rynku i koszt symulacji." value={nAgents} min={10} max={60} step={5} onChange={setNAgents} display={String(nAgents)} />
              <Slider label="Wartość katalogu" hint="Wartość fundamentalna V w PLN" tooltip="V: wartość fundamentalna katalogu. M1 Revenue Ratio liczy RR = revenue / V." value={tv} min={10000} max={200000} step={10000} onChange={setTv} display={`${Math.round(tv / 1000)}k`} />
              <Slider label="T_learn" hint="Rundy uczenia w jednej repetycji" tooltip="T_learn: liczba rund aktualizacji Q. Qₐ ← Qₐ + (r − Qₐ) ÷ nₐ." value={roundsLearn} min={40} max={250} step={20} onChange={setRoundsLearn} display={String(roundsLearn)} />
              <Slider label="T_eval" hint="Rundy ewaluacji po uczeniu" tooltip="T_eval: liczba rund pomiaru po treningu. metric = (1 ÷ Tₑᵥₐₗ) · ∑ₜ metricₜ." value={roundsEval} min={20} max={140} step={10} onChange={setRoundsEval} display={String(roundsEval)} />
              <Slider label="Repetycje" hint="Ile seedów na konfigurację" tooltip="reps: liczba niezależnych seedów. x̄ = (1 ÷ reps) · ∑ᵣ xᵣ; sd = √(∑ᵣ(xᵣ − x̄)² ÷ (reps − 1))." value={reps} min={3} max={9} step={1} onChange={setReps} display={String(reps)} />
            </Box>

            <Box>
              <Label>Redesign search</Label>
              <Slider label="Eksploracja" hint="Losowe kandydackie konfiguracje" tooltip="searchExplore: liczba losowych konfiguracji mechanizmu. Nᶜᵃⁿᵈ = searchExplore + searchExploit." value={searchExplore} min={6} max={18} step={1} onChange={setSearchExplore} display={String(searchExplore)} />
              <Slider label="Eksploatacja" hint="Mutacje najlepszych kandydatów" tooltip="searchExploit: liczba mutacji elitarnych konfiguracji. Zwiększa lokalne przeszukanie wokół najlepszych wyników." value={searchExploit} min={8} max={24} step={1} onChange={setSearchExploit} display={String(searchExploit)} />
              <Slider label="Limit autopilota" hint="Maksymalna liczba kolejnych sugerowanych przebiegów; kolejne runy mogą potwierdzać stabilność bez zmiany parametrów" tooltip="Autopilot: runₖ → interpretacjaₖ → parametryₖ₊₁ → seedₖ₊₁ → runₖ₊₁. Limit zatrzymuje pętlę po wskazanej liczbie przebiegów." value={autoRunLimit} min={1} max={MAX_AUTOPILOT_RUN_LIMIT} step={1} onChange={setAutoRunLimit} display={String(autoRunLimit)} />
              <div style={{ fontSize: 12, color: "#94949e", lineHeight: 1.6 }}>
                Szacowana liczba ewaluacji konfiguracji: <strong style={{ color: "#fff" }}>{estimatedEvaluations}</strong>.
                Każda ewaluacja to <strong style={{ color: "#fff" }}>{reps}</strong> repetycji. Dla validated i redesign obowiązuje polityka <strong style={{ color: "#fff" }}>S ≥ {MIN_VALIDATED_FRACTIONS}</strong>.
                Aktualne seedy: <strong style={{ color: "#fff" }}>{seedBase}</strong> / <strong style={{ color: "#fff" }}>{seedSearch}</strong>.
              </div>
            </Box>

            <ParameterHints />

            <button style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => handleRun()}>
              {busy ? "Trwa przebudowa i uruchomienie..." : "Przebuduj rozwiązanie i uruchom"}
            </button>
            <button
              style={{ ...btnSecondary, borderColor: "#2ecc71", color: "#fff", opacity: busy ? 0.7 : 1 }}
              disabled={busy}
              onClick={handleStartAutopilot}
            >
              Start autopilota badawczego: {autoRunLimit} przebiegów
            </button>
            {autoMode ? (
              <button style={{ ...btnSecondary, borderColor: "#f0a030", color: "#fff" }} onClick={handleStopAuto}>
                Zatrzymaj autopilot
              </button>
            ) : null}

            <Box accent={busy ? "#8b7cf640" : "#33333b"}>
              <Label>Status</Label>
              <div style={{ fontSize: 13, color: "#fff", marginBottom: 6 }}>{phase}</div>
              <div style={{ fontSize: 12, color: "#8e8e98", lineHeight: 1.6 }}>
                Pipeline: walidacja silnika → RTZ v1.0 legacy → RTZ v1.1 validated → search v2.0 → ablacja → krzywa uczenia → eksport.
              </div>
            </Box>

            <MathHints />
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {!data && !busy ? (
              <Box>
                <Label>Co się zmieniło</Label>
                <div style={{ fontSize: 14, color: "#d6d6dd", lineHeight: 1.75 }}>
                  <div>• zachowany historyczny mechanizm <strong>RTZ v1.0 legacy</strong>,</div>
                  <div>• dodany <strong>RTZ v1.1 validated</strong> z alokacją budżetowo wykonalną i polityką S ≥ 1000,</div>
                  <div>• FI liczony tylko dla rynku rzeczywistego, bez <strong>Red Teamu</strong>,</div>
                  <div>• przebudowany redesign v2.0 z fairness-aware selection, Pareto frontem i eksportem do artykułu.</div>
                </div>
              </Box>
            ) : null}

            {busy ? (
              <Box accent="#8b7cf640">
                <Label>Uruchomienie</Label>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{phase}</div>
                <div style={{ fontSize: 12, color: "#90909a", lineHeight: 1.7 }}>
                  Aplikacja działa asynchronicznie, więc status odświeża się między kolejnymi blokami obliczeń.
                </div>
              </Box>
            ) : null}

            <ExperimentHistory rows={history} />

            {data ? <Results data={data} onApplyParams={handleApplyParams} onApplyAndRun={handleApplyAndRun} onAutoRun={handleAutoRun} autoRunLimit={autoRunLimit} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
