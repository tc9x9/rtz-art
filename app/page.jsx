"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import experimentDefaults from "../config/experiment-defaults.json";

// =========================
// RTZ Auction Lab
// v1.0 legacy -> v1.1 validated -> v2.1 revenue-gated redesign
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
    help: "M1 mierzy przychód aukcji względem wartości fundamentalnej katalogu V. Wyższa wartość jest korzystna, ale konfiguracje fairness-preferred muszą utrzymać co najmniej 90%.",
  },
  ae: {
    formula: "AE = PVᵣₑₐₗ ÷ PV*,  PVᵣₑₐₗ = ∑ᵢ sᵢ · pvᵢ",
    target: "cel: AE ≥ 0.70",
    help: "M2 porównuje wartość prywatną faktycznej alokacji z najlepszą budżetowo wykonalną alokacją przy tej samej cenie. Wyższa wartość jest korzystna.",
  },
  eg: {
    formula: "EG = max((ROIᴿᵉᵈ − ROIᴵⁿᵈ) ÷ (|ROIᴿᵉᵈ| + |ROIᴵⁿᵈ| + 0.01), 0)",
    target: "cel: EG ≤ 0.15",
    help: "M3 wykrywa przewagę Red Teamu nad uczestnikami indywidualnymi. Niższa wartość jest korzystna; zero oznacza brak przewagi Red Teamu w ROI.",
  },
  cr: {
    formula: "CR = Nᶜˡᵉᵃʳᵉᵈₑᵥₐₗ ÷ Tₑᵥₐₗ",
    target: "cel: CR ≥ 0.85",
    help: "M4 mierzy, jak często aukcja sprzedaje pełne S frakcji w rundach ewaluacji. Wyższa wartość jest korzystna.",
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
const REVENUE_GATE = 0.9;
const ADAPTIVE_STEP_RISK_PENALTY = 0.035;
const METRIC_DIRECTIONS = { rr: "max", ae: "max", eg: "min", cr: "max", fi: "max" };
const PM = [0.4, 0.55, 0.7, 0.85, 0.95, 1.0, 1.1, 1.25, 1.5];
const BF = [0.2, 0.4, 0.6, 0.8, 1.0];
const ACTION_COUNT = PM.length * BF.length;
const DESIGN_RULES = ["proportional", "priority", "equal", "hybrid"];
const DESIGN_STEPS = ["linear", "exponential", "adaptive"];
const DESIGN_FRACTIONS = [1000, 2500, 5000, 10000];
const DEFAULT_AUTOPILOT_RUN_LIMIT = 7;
const MAX_AUTOPILOT_BATCH_LIMIT = 50;
const SESSION_STORAGE_KEY = "rtz-auction-lab-autopilot-session-v2-1";
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

function readStoredSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Cannot read RTZ session storage", err);
    return null;
  }
}

function writeStoredSession(snapshot) {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    console.warn("Cannot persist RTZ session storage", err);
    return false;
  }
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

function isRevenueFeasible(m) {
  return m.rr >= REVENUE_GATE;
}

function adaptiveStepPenalty(entry) {
  if (entry.cfg?.stepType !== "adaptive") return 0;
  const rrGap = Math.max(0, REVENUE_GATE - entry.mean.rr);
  return ADAPTIVE_STEP_RISK_PENALTY + rrGap * 0.15;
}

function v21SelectionValue(entry) {
  return entry.selectionScore - adaptiveStepPenalty(entry);
}

function compareV20TradeoffEvaluations(a, b) {
  const aPreferred = isFairnessPreferred(a.mean);
  const bPreferred = isFairnessPreferred(b.mean);
  if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
  if (a.targetHits !== b.targetHits) return b.targetHits - a.targetHits;
  if (Math.abs(a.mean.fi - b.mean.fi) > 1e-9) return b.mean.fi - a.mean.fi;
  if (Math.abs(a.mean.eg - b.mean.eg) > 1e-9) return a.mean.eg - b.mean.eg;
  if (Math.abs(a.selectionScore - b.selectionScore) > 1e-9) return b.selectionScore - a.selectionScore;
  return b.score - a.score;
}

function compareV21Evaluations(a, b) {
  const aFeasible = isRevenueFeasible(a.mean);
  const bFeasible = isRevenueFeasible(b.mean);
  if (aFeasible !== bFeasible) return aFeasible ? -1 : 1;

  if (!aFeasible && !bFeasible && Math.abs(a.mean.rr - b.mean.rr) > 1e-9) {
    return b.mean.rr - a.mean.rr;
  }

  const aPreferred = isFairnessPreferred(a.mean);
  const bPreferred = isFairnessPreferred(b.mean);
  if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
  if (a.targetHits !== b.targetHits) return b.targetHits - a.targetHits;
  const aSelection = v21SelectionValue(a);
  const bSelection = v21SelectionValue(b);
  if (Math.abs(aSelection - bSelection) > 1e-9) return bSelection - aSelection;
  if (Math.abs(a.mean.fi - b.mean.fi) > 1e-9) return b.mean.fi - a.mean.fi;
  if (Math.abs(a.mean.eg - b.mean.eg) > 1e-9) return a.mean.eg - b.mean.eg;
  return b.score - a.score;
}

function compareEvaluations(a, b) {
  return compareV21Evaluations(a, b);
}

function candidateObjective(entry) {
  const rrGap = Math.max(0, REVENUE_GATE - entry.mean.rr);
  const rrPenalty = rrGap * 3.0;
  const feasibleBonus = isRevenueFeasible(entry.mean) ? 0.2 : 0;
  const noisePenalty = ((entry.sd?.rr || 0) + (entry.sd?.eg || 0) + (entry.sd?.fi || 0)) * 0.05;
  return entry.selectionScore + feasibleBonus - rrPenalty - noisePenalty - adaptiveStepPenalty(entry);
}

function candidateSignature(cfg) {
  return [
    cfg.alpha,
    cfg.numFractions,
    cfg.allocationRule,
    cfg.stepType,
    cfg.maxConcentration,
  ].join("|");
}

function withSearchMeta(evaluation, searchStage, acquisition = null) {
  return {
    ...evaluation,
    searchStage,
    acquisition: acquisition === null ? null : round3(acquisition),
  };
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
  return {
    engineVersion: "validated",
    label: "candidate",
    alpha: round3(0.3 + rand() * 0.6),
    numFractions: DESIGN_FRACTIONS[Math.floor(rand() * DESIGN_FRACTIONS.length)],
    allocationRule: DESIGN_RULES[Math.floor(rand() * DESIGN_RULES.length)],
    stepType: DESIGN_STEPS[Math.floor(rand() * DESIGN_STEPS.length)],
    maxConcentration: round3(0.1 + rand() * 0.9),
  };
}

function mutateDesign(parent, rand) {
  const child = { ...parent, engineVersion: "validated", label: "candidate" };
  const move = Math.floor(rand() * 5);

  if (move === 0) child.alpha = round3(clamp(child.alpha + (rand() - 0.5) * 0.15, 0.3, 0.9));
  if (move === 1) {
    const idx = DESIGN_FRACTIONS.indexOf(child.numFractions);
    const delta = rand() < 0.5 ? -1 : 1;
    child.numFractions = DESIGN_FRACTIONS[clamp(idx + delta, 0, DESIGN_FRACTIONS.length - 1)];
  }
  if (move === 2) child.allocationRule = DESIGN_RULES[Math.floor(rand() * DESIGN_RULES.length)];
  if (move === 3) child.stepType = DESIGN_STEPS[Math.floor(rand() * DESIGN_STEPS.length)];
  if (move === 4) child.maxConcentration = round3(clamp(child.maxConcentration + (rand() - 0.5) * 0.2, 0.1, 1));

  return child;
}

function weightedChoice(items, weights, rand) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return items[Math.floor(rand() * items.length)];
  let pick = rand() * total;
  for (let i = 0; i < items.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return items[i];
  }
  return items[items.length - 1];
}

function sampleContinuousFromElite(values, lo, hi, jitter, rand) {
  if (!values.length || rand() < 0.18) return round3(lo + rand() * (hi - lo));
  const base = values[Math.floor(rand() * values.length)];
  return round3(clamp(base + (rand() - 0.5) * jitter, lo, hi));
}

function sampleCategoryFromElite(values, choices, rand) {
  if (!values.length || rand() < 0.12) return choices[Math.floor(rand() * choices.length)];
  const weights = choices.map(choice => values.filter(v => v === choice).length + 1);
  return weightedChoice(choices, weights, rand);
}

function gaussianDensity(x, values, lo, hi) {
  if (!values.length) return 1 / Math.max(1e-9, hi - lo);
  const m = mean(values);
  const spread = Math.max(sd(values), (hi - lo) * 0.08, 1e-4);
  const norm = 1 / (spread * Math.sqrt(2 * Math.PI));
  return values.reduce((sum, v) => {
    const z = (x - v) / spread;
    return sum + norm * Math.exp(-0.5 * z * z);
  }, 0) / values.length + 1e-6 + Math.abs(x - m) * 1e-6;
}

function categoricalDensity(value, values, choices) {
  return (values.filter(v => v === value).length + 1) / (values.length + choices.length);
}

function normalizedDistance(a, b) {
  const alpha = Math.abs(a.alpha - b.alpha) / 0.6;
  const concentration = Math.abs(a.maxConcentration - b.maxConcentration) / 0.9;
  const fractions = Math.abs(DESIGN_FRACTIONS.indexOf(a.numFractions) - DESIGN_FRACTIONS.indexOf(b.numFractions)) / (DESIGN_FRACTIONS.length - 1);
  const rule = a.allocationRule === b.allocationRule ? 0 : 1;
  const step = a.stepType === b.stepType ? 0 : 1;
  return (alpha + concentration + fractions + rule + step) / 5;
}

function buildSurrogateDesign(history, rand) {
  const ordered = [...history].sort((a, b) => candidateObjective(b) - candidateObjective(a));
  const elite = ordered.slice(0, Math.max(3, Math.ceil(ordered.length * 0.25)));
  return {
    engineVersion: "validated",
    label: "candidate",
    alpha: sampleContinuousFromElite(elite.map(e => e.cfg.alpha), 0.3, 0.9, 0.18, rand),
    numFractions: sampleCategoryFromElite(elite.map(e => e.cfg.numFractions), DESIGN_FRACTIONS, rand),
    allocationRule: sampleCategoryFromElite(elite.map(e => e.cfg.allocationRule), DESIGN_RULES, rand),
    stepType: sampleCategoryFromElite(elite.map(e => e.cfg.stepType), DESIGN_STEPS, rand),
    maxConcentration: sampleContinuousFromElite(elite.map(e => e.cfg.maxConcentration), 0.1, 1.0, 0.24, rand),
  };
}

function surrogateAcquisition(cfg, history) {
  if (history.length < 6) return 0;
  const ordered = [...history].sort((a, b) => candidateObjective(b) - candidateObjective(a));
  const elite = ordered.slice(0, Math.max(3, Math.ceil(ordered.length * 0.25)));
  const rest = ordered.slice(elite.length);
  const restOrAll = rest.length ? rest : ordered;
  const ratio = (eliteDensity, restDensity) => Math.log((eliteDensity + 1e-6) / (restDensity + 1e-6));
  const densityScore =
    ratio(gaussianDensity(cfg.alpha, elite.map(e => e.cfg.alpha), 0.3, 0.9), gaussianDensity(cfg.alpha, restOrAll.map(e => e.cfg.alpha), 0.3, 0.9)) +
    ratio(gaussianDensity(cfg.maxConcentration, elite.map(e => e.cfg.maxConcentration), 0.1, 1), gaussianDensity(cfg.maxConcentration, restOrAll.map(e => e.cfg.maxConcentration), 0.1, 1)) +
    ratio(categoricalDensity(cfg.numFractions, elite.map(e => e.cfg.numFractions), DESIGN_FRACTIONS), categoricalDensity(cfg.numFractions, restOrAll.map(e => e.cfg.numFractions), DESIGN_FRACTIONS)) +
    ratio(categoricalDensity(cfg.allocationRule, elite.map(e => e.cfg.allocationRule), DESIGN_RULES), categoricalDensity(cfg.allocationRule, restOrAll.map(e => e.cfg.allocationRule), DESIGN_RULES)) +
    ratio(categoricalDensity(cfg.stepType, elite.map(e => e.cfg.stepType), DESIGN_STEPS), categoricalDensity(cfg.stepType, restOrAll.map(e => e.cfg.stepType), DESIGN_STEPS));
  const novelty = Math.min(...history.map(entry => normalizedDistance(cfg, entry.cfg)));
  return densityScore + 0.35 * novelty;
}

function proposeSurrogateCandidates(history, count, rand) {
  if (count <= 0 || history.length < 6) return [];
  const seen = new Set(history.map(entry => candidateSignature(entry.cfg)));
  const pool = [];
  const poolSize = Math.max(36, count * 10);

  for (let i = 0; i < poolSize * 4 && pool.length < poolSize; i++) {
    const cfg = buildSurrogateDesign(history, rand);
    const signature = candidateSignature(cfg);
    if (seen.has(signature)) continue;
    seen.add(signature);
    pool.push({ cfg, acquisition: surrogateAcquisition(cfg, history) });
  }

  return pool.sort((a, b) => b.acquisition - a.acquisition).slice(0, count);
}

async function searchRedesign(params, onProgress) {
  const rand = mulberry32(params.seedSearch);
  const all = [];
  const exploreCount = params.searchExplore;
  const exploitCount = params.searchExploit;
  const bayesCount = params.searchBayes ?? 0;

  for (let i = 0; i < exploreCount; i++) {
    onProgress(`Eksploracja ${i + 1}/${exploreCount}`);
    const cfg = randomDesign(rand);
    const evaluated = evaluateConfig(cfg, { ...params, seedBase: params.seedBase + 1000 + i * 37 });
    all.push(withSearchMeta(evaluated, "random"));
    await sleep(0);
  }

  for (let i = 0; i < exploitCount; i++) {
    const ordered = [...all].sort(compareEvaluations);
    const elite = ordered.slice(0, Math.max(3, Math.ceil(ordered.length * 0.2)));
    const parent = elite[Math.floor(rand() * elite.length)];
    onProgress(`Eksploatacja ${i + 1}/${exploitCount}`);
    const cfg = mutateDesign(parent.cfg, rand);
    const evaluated = evaluateConfig(cfg, { ...params, seedBase: params.seedBase + 5000 + i * 53 });
    all.push(withSearchMeta(evaluated, "elite-mutation"));
    await sleep(0);
  }

  const surrogateCandidates = proposeSurrogateCandidates(all, bayesCount, rand);
  for (let i = 0; i < bayesCount; i++) {
    const proposal = surrogateCandidates[i] || {
      cfg: mutateDesign([...all].sort(compareEvaluations)[0].cfg, rand),
      acquisition: 0,
    };
    onProgress(`Bayesian-lite ${i + 1}/${bayesCount}, acquisition=${proposal.acquisition.toFixed(2)}`);
    const evaluated = evaluateConfig(proposal.cfg, { ...params, seedBase: params.seedBase + 8000 + i * 67 });
    all.push(withSearchMeta(evaluated, "bayesian-lite", proposal.acquisition));
    await sleep(0);
  }

  const ordered = [...all].sort(compareV21Evaluations);
  const tradeoffOrdered = [...all].sort(compareV20TradeoffEvaluations);
  const feasible = all.filter(entry => isRevenueFeasible(entry.mean)).sort(compareV21Evaluations);
  const pareto = computeParetoFront(all).sort(compareV21Evaluations);
  const bestFeasible = feasible[0] || null;
  const best = bestFeasible || ordered[0];
  return {
    all: ordered,
    pareto,
    best,
    bestFeasible,
    bestTradeoff: tradeoffOrdered[0],
    revenueGate: REVENUE_GATE,
    revenueFeasibleCount: feasible.length,
    adaptivePenalty: ADAPTIVE_STEP_RISK_PENALTY,
    revenueGateFallback: feasible.length === 0,
    activeVersion: feasible.length ? "RTZ v2.1 revenue-gated" : "RTZ v2.1 fallback",
    searchSummary: {
      method: "random + elite mutation + Bayesian-lite/TPE surrogate",
      random: all.filter(entry => entry.searchStage === "random").length,
      eliteMutation: all.filter(entry => entry.searchStage === "elite-mutation").length,
      bayesianLite: all.filter(entry => entry.searchStage === "bayesian-lite").length,
      surrogateReady: all.length >= 6,
    },
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
  onProgress("RTZ v2.1 revenue-gated redesign gotowe.");
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

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values) {
  return `${values.map(csvCell).join(",")}\n`;
}

function buildCSV(data, archive = []) {
  const { legacy, validated, redesign } = data;
  const best = redesign.best;
  let csv = "comparison,metric,mean,sd,rawScore,selectionScore,targetHits\n";

  [["legacy", legacy], ["validated", validated], ["v2_1_best", best], ["v2_0_tradeoff", redesign.bestTradeoff]].filter(([, entry]) => entry).forEach(([name, entry]) => {
    ["rr", "ae", "eg", "cr", "fi"].forEach(metric => {
      csv += `${name},${metric},${entry.mean[metric]},${entry.sd[metric]},${entry.score},${entry.selectionScore},${entry.targetHits}\n`;
    });
  });

  csv += `\nREDESIGN,revenueGate,feasibleCount,fallback,activeVersion,adaptivePenalty\nredesign,${redesign.revenueGate ?? REVENUE_GATE},${redesign.revenueFeasibleCount ?? ""},${redesign.revenueGateFallback ?? ""},${redesign.activeVersion || "RTZ v2.1 revenue-gated"},${redesign.adaptivePenalty ?? ADAPTIVE_STEP_RISK_PENALTY}\n`;

  csv += "\npareto_rank,stage,acquisition,alpha,numFractions,allocationRule,stepType,maxConcentration,rr,ae,eg,cr,fi,rawScore,selectionScore,targetHits\n";
  data.redesign.pareto.forEach((entry, idx) => {
    csv += `${idx + 1},${entry.searchStage || ""},${entry.acquisition ?? ""},${entry.cfg.alpha},${entry.cfg.numFractions},${entry.cfg.allocationRule},${entry.cfg.stepType},${entry.cfg.maxConcentration},${entry.mean.rr},${entry.mean.ae},${entry.mean.eg},${entry.mean.cr},${entry.mean.fi},${entry.score},${entry.selectionScore},${entry.targetHits}\n`;
  });

  csv += "\nCANDIDATES,rank,stage,acquisition,alpha,numFractions,allocationRule,stepType,maxConcentration,rr,ae,eg,cr,fi,rawScore,selectionScore,targetHits\n";
  data.redesign.all.forEach((entry, idx) => {
    csv += `candidate,${idx + 1},${entry.searchStage || ""},${entry.acquisition ?? ""},${entry.cfg.alpha},${entry.cfg.numFractions},${entry.cfg.allocationRule},${entry.cfg.stepType},${entry.cfg.maxConcentration},${entry.mean.rr},${entry.mean.ae},${entry.mean.eg},${entry.mean.cr},${entry.mean.fi},${entry.score},${entry.selectionScore},${entry.targetHits}\n`;
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

  const hypotheses = buildHypothesisAssessment(data, archive);
  csv += "\nHYPOTHESES,hypothesis,status,statement,evidence\n";
  Object.values(hypotheses).forEach(item => {
    csv += csvRow([item.label, item.status, item.statement, item.evidence.join(" ")]);
  });

  if (archive.length) {
    csv += "\nAUTOPILOT_RUNS,run,generatedAt,roundsLearn,roundsEval,reps,seedBase,seedSearch,searchExplore,searchExploit,searchBayes,rr,ae,eg,cr,fi,rawScore,selectionScore,targetHits,alpha,numFractions,allocationRule,stepType,maxConcentration,h1,h2\n";
    archive.slice().reverse().forEach(entry => {
      const row = entry.summary;
      const assessment = entry.hypotheses || buildHypothesisAssessment(entry.result, archive);
      csv += csvRow([
        row.id,
        row.generatedAt,
        row.inputs.roundsLearn,
        row.inputs.roundsEval,
        row.inputs.reps,
        row.inputs.seedBase,
        row.inputs.seedSearch,
        row.inputs.searchExplore,
        row.inputs.searchExploit,
        row.inputs.searchBayes,
        row.rr,
        row.ae,
        row.eg,
        row.cr,
        row.fi,
        row.score,
        row.selectionScore,
        row.targetHits,
        row.cfg.alpha,
        row.cfg.numFractions,
        row.cfg.allocationRule,
        row.cfg.stepType,
        row.cfg.maxConcentration,
        assessment.h1.status,
        assessment.h2.status,
      ]);
    });

    csv += "\nAUTOPILOT_CANDIDATES,run,rank,stage,acquisition,alpha,numFractions,allocationRule,stepType,maxConcentration,rr,ae,eg,cr,fi,rawScore,selectionScore,targetHits\n";
    archive.slice().reverse().forEach(entry => {
      entry.result.redesign.all.forEach((candidate, idx) => {
        csv += csvRow([
          entry.summary.id,
          idx + 1,
          candidate.searchStage || "",
          candidate.acquisition ?? "",
          candidate.cfg.alpha,
          candidate.cfg.numFractions,
          candidate.cfg.allocationRule,
          candidate.cfg.stepType,
          candidate.cfg.maxConcentration,
          candidate.mean.rr,
          candidate.mean.ae,
          candidate.mean.eg,
          candidate.mean.cr,
          candidate.mean.fi,
          candidate.score,
          candidate.selectionScore,
          candidate.targetHits,
        ]);
      });
    });
  }

  return csv;
}

function buildJSONExport(data, archive = []) {
  return {
    latest: data,
    hypotheses: buildHypothesisAssessment(data, archive),
    autopilot: {
      runCount: archive.length,
      runs: archive,
    },
  };
}

function buildLaTeX(data) {
  const { legacy, validated, redesign } = data;
  const best = redesign.best;
  const delta = (a, b) => round3(a - b);
  const rows = ["rr", "ae", "eg", "cr", "fi"];

  const texLines = [
    String.raw`\begin{table}[h]`,
    String.raw`\centering`,
    String.raw`\caption{From RTZ v1.0 legacy to RTZ v2.1 revenue-gated redesign}`,
    String.raw`\label{tab:rtz-comparison}`,
    String.raw`\begin{tabular}{lccc}`,
    String.raw`\toprule`,
    String.raw`Metric & v1.0 legacy & v1.1 validated & v2.1 redesign \\`,
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
  texLines.push(String.raw`\\[6pt]\small v2.1 configuration: $\alpha=${best.cfg.alpha}$, $S=${best.cfg.numFractions}$, allocation=$\text{${best.cfg.allocationRule}}$, step=$\text{${best.cfg.stepType}}$, $c_{max}=${best.cfg.maxConcentration}$. FI is computed on market types only (individual, institutional, speculator). v2.1 selects the best candidate subject to RR $\geq 0.90$ when such a candidate exists.`);
  texLines.push(String.raw`\end{table}`);
  texLines.push("");
  texLines.push("% Legacy to validated deltas");
  rows.forEach(k => {
    texLines.push(`% ${k}: validated - legacy = ${delta(validated.mean[k], legacy.mean[k]).toFixed(3)}; v2 - validated = ${delta(best.mean[k], validated.mean[k]).toFixed(3)}`);
  });

  return `${texLines.join("\n")}\n`;
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

function HelpLink({ href = "/help", children = "Pomoc" }) {
  return (
    <a
      href={href}
      style={{
        color: "#bdb5ff",
        fontSize: 11,
        fontWeight: 800,
        textDecoration: "none",
        borderBottom: "1px solid rgba(189,181,255,0.45)",
      }}
    >
      {children}
    </a>
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <Label>Matematyka metryk</Label>
        <HelpLink href="/help#metrics">pełny opis</HelpLink>
      </div>
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
    ["explore/exploit", "budżet searchu mechanizmu", "Nᶜᵃⁿᵈ = searchExplore + searchExploit + searchBayes", "Zwiększać przy search-limited; parametr rozszerza przeszukiwanie konfiguracji mechanizmu, nie wydłuża treningu agentów."],
    ["Bayesian-lite", "surrogate-assisted kandydaci", "x* = arg maxₓ [log ℓ(x) − log g(x) + novelty(x)]", "Po explore/exploit model TPE-like estymuje, gdzie dobre konfiguracje występują częściej, i wybiera kandydatów do pełnej ewaluacji symulatorem."],
    ["autopilot", "pętla badawcza", "runₖ → interpretacjaₖ → parametryₖ₊₁ → seedₖ₊₁ → runₖ₊₁", "Startuje od aktualnych suwaków, potem sam stosuje rekomendacje aż do limitu albo zatrzymania."],
  ];

  return (
    <Box>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <Label>Podpowiedzi parametrów</Label>
        <HelpLink href="/help#parameters">więcej</HelpLink>
      </div>
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

function formatPct(v) {
  return `${(v * 100).toFixed(1)}%`;
}

function formatMeanSd(entry, key) {
  return `${formatPct(entry.mean[key])} ± ${formatPct(entry.sd[key])}`;
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
    next.searchBayes = stepUp(next.searchBayes ?? 0, 3, 18);
    next.roundsEval = stepUp(next.roundsEval, 20, 140);
    reasons.push(`M1 RR v2.1=${(best.mean.rr * 100).toFixed(1)}% jest poniżej bariery 90%, więc kolejny run zwiększa search i T_eval.`);
  }

  if (best.selectionScore < validated.selectionScore || best.targetHits < validated.targetHits) {
    diagnoses.add("search-limited");
    next.searchExplore = stepUp(next.searchExplore, 2, 18);
    next.searchExploit = stepUp(next.searchExploit, 2, 24);
    next.searchBayes = stepUp(next.searchBayes ?? 0, 2, 18);
    reasons.push(`v2.1 nie przebija validated wystarczająco stabilnie, więc kolejny run poszerza search i zwiększa liczbę kandydatów Bayesian-lite.`);
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

function hypothesisStatus(ok, partial) {
  if (ok) return "wsparta";
  if (partial) return "częściowo wsparta";
  return "niewsparta";
}

function formatSignedNumber(v, digits = 3) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}`;
}

function buildHypothesisAssessment(data, archive = []) {
  const archiveEntries = archive.filter(entry => entry.result && entry.summary);
  const entries = archiveEntries.length
    ? archiveEntries
    : data
      ? [{ result: data, summary: summarizeRun(data, 1) }]
      : [];
  const summaries = entries.map(entry => entry.summary);
  const n = entries.length;

  const fiDeltas = entries.map(entry => entry.result.redesign.best.mean.fi - entry.result.validated.mean.fi);
  const egImprovements = entries.map(entry => entry.result.validated.mean.eg - entry.result.redesign.best.mean.eg);
  const rrValues = entries.map(entry => entry.result.redesign.best.mean.rr);
  const h1FullShare = entries.length
    ? mean(entries.map(entry => {
      const best = entry.result.redesign.best;
      const validated = entry.result.validated;
      return best.mean.rr >= 0.9 && best.mean.fi > validated.mean.fi && best.mean.eg < validated.mean.eg ? 1 : 0;
    }))
    : 0;
  const rrMean = mean(rrValues);
  const fiDeltaMean = mean(fiDeltas);
  const egImprovementMean = mean(egImprovements);
  const h1Full = n > 0 && rrMean >= 0.9 && fiDeltaMean > 0 && egImprovementMean > 0 && h1FullShare >= 0.6;
  const h1Partial = n > 0 && rrMean >= 0.9 && (fiDeltaMean > 0 || egImprovementMean > 0 || h1FullShare >= 0.4);

  const learningTrends = entries.map(entry => {
    const learningRows = entry.result.learningCurve?.rows || [];
    const firstLearning = learningRows[0];
    const lastLearning = learningRows[learningRows.length - 1];
    return firstLearning && lastLearning ? lastLearning.selectionDelta - firstLearning.selectionDelta : 0;
  });
  const learningBestAtHighEndShare = entries.length
    ? mean(entries.map(entry => {
      const learningRows = entry.result.learningCurve?.rows || [];
      const learningBest = entry.result.learningCurve?.bestBySelectionDelta;
      if (!learningRows.length || !learningBest) return 0;
      return learningBest.roundsLearn === Math.max(...learningRows.map(row => row.roundsLearn)) ? 1 : 0;
    }))
    : 0;
  const bayesianBestShare = entries.length
    ? mean(entries.map(entry => entry.result.redesign.best.searchStage === "bayesian-lite" ? 1 : 0))
    : 0;
  const bayesianParetoShare = entries.length
    ? mean(entries.map(entry => entry.result.redesign.pareto?.some(candidate => candidate.searchStage === "bayesian-lite") ? 1 : 0))
    : 0;
  const selectionSd = summaries.length > 1 ? sd(summaries.map(row => row.selectionScore)) : null;
  const configShare = summaries.length
    ? Math.max(...Object.values(summaries.reduce((acc, row) => {
      const sig = candidateSignature(row.cfg);
      acc[sig] = (acc[sig] || 0) + 1;
      return acc;
    }, {}))) / summaries.length
    : null;
  const stabilityObserved = summaries.length >= 3 && (selectionSd <= 0.03 || configShare >= 0.6);
  const learningTrendMean = mean(learningTrends);
  const h2Evidence = learningTrendMean > 0 || learningBestAtHighEndShare >= 0.5 || bayesianBestShare > 0 || bayesianParetoShare >= 0.5;
  const h2Full = h2Evidence && stabilityObserved;
  const h2Partial = h2Evidence || stabilityObserved;

  return {
    h1: {
      label: "H1",
      status: hypothesisStatus(h1Full, h1Partial),
      supported: h1Full,
      partial: h1Partial && !h1Full,
      statement: "RTZ v2.1 poprawia fairness i odporność względem RTZ v1.1 bez naruszenia bariery RR ≥ 0.90.",
      evidence: [
        `Agregacja autopilota: n=${n}, średni RR v2.1=${formatPct(rrMean)} ${rrMean >= 0.9 ? "spełnia" : "nie spełnia"} barierę 90%.`,
        `Średnie ΔFI względem v1.1=${formatSignedNumber(fiDeltaMean)}.`,
        `Średnia poprawa EG względem v1.1=${formatSignedNumber(egImprovementMean)}; wartość dodatnia oznacza spadek exploitation gap.`,
        `Pełne spełnienie H1 wystąpiło w ${(h1FullShare * 100).toFixed(0)}% przebiegów.`,
      ],
    },
    h2: {
      label: "H2",
      status: hypothesisStatus(h2Full, h2Partial),
      supported: h2Full,
      partial: h2Partial && !h2Full,
      statement: "Dłuższe uczenie oraz Bayesian-lite stabilizują wybór konfiguracji.",
      evidence: [
        `Agregacja autopilota: n=${n}, średni trend Δselection między skrajnymi T_learn=${formatSignedNumber(learningTrendMean)}.`,
        `Najlepszy kandydat pochodził z Bayesian-lite w ${(bayesianBestShare * 100).toFixed(0)}% przebiegów; Bayesian-lite wystąpił na froncie Pareto w ${(bayesianParetoShare * 100).toFixed(0)}% przebiegów.`,
        `Najlepszy punkt krzywej uczenia był na górnej granicy siatki w ${(learningBestAtHighEndShare * 100).toFixed(0)}% przebiegów.`,
        selectionSd === null
          ? "Stabilność między przebiegami wymaga co najmniej dwóch uruchomień; dla stabilności konfiguracji zalecane są co najmniej trzy."
          : `Historia autopilota: sd(selection)=${selectionSd.toFixed(3)}, dominująca konfiguracja=${((configShare ?? 0) * 100).toFixed(0)}%.`,
      ],
    },
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <Label>Rundy uczenia vs poprawa metryk</Label>
        <HelpLink href="/help#learning">interpretacja</HelpLink>
      </div>
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

function RunDetail({ entry }) {
  if (!entry) return null;
  const { result, hypotheses } = entry;
  const best = result.redesign.best;
  const tradeoff = result.redesign.bestTradeoff;
  const rows = ["rr", "ae", "eg", "cr", "fi"];
  const learningBest = result.learningCurve?.bestBySelectionDelta;
  const searchSummary = result.redesign.searchSummary || {};

  return (
    <div style={{ marginTop: 12, background: "#111115", border: "1px solid #292932", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ color: "#fff", fontWeight: 800 }}>Szczegóły run #{entry.summary.id}</div>
          <div style={{ color: "#8f8f98", fontSize: 11, lineHeight: 1.5 }}>
            {entry.generatedAt} · T_learn={result.inputs.roundsLearn}, T_eval={result.inputs.roundsEval}, reps={result.inputs.reps}, seedBase={result.inputs.seedBase}, seedSearch={result.inputs.seedSearch}
          </div>
        </div>
        <div style={{ color: "#d7d7dd", fontSize: 12 }}>
          selection <strong style={{ color: "#fff" }}>{best.selectionScore.toFixed(3)}</strong> · raw <strong style={{ color: "#fff" }}>{best.score.toFixed(3)}</strong>
        </div>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #35353b" }}>
              <th style={thStyle}>Metryka</th>
              <th style={thStyle}>v1.0 legacy</th>
              <th style={thStyle}>v1.1 validated</th>
              <th style={thStyle}>v2.1 best</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(key => (
              <tr key={key} style={{ borderBottom: "1px solid #25252b" }}>
                <td style={tdStyle}>{METRIC_LABELS[key]}</td>
                <td style={tdStyle}>{formatMeanSd(result.legacy, key)}</td>
                <td style={tdStyle}>{formatMeanSd(result.validated, key)}</td>
                <td style={tdStyle}>{formatMeanSd(best, key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
        <div style={{ color: "#d7d7dd", fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: "#fff" }}>Konfiguracja v2.1:</strong><br />
          α={best.cfg.alpha}, S={best.cfg.numFractions}, allocation={best.cfg.allocationRule}, step={best.cfg.stepType}, c_max={best.cfg.maxConcentration}
          {tradeoff && tradeoff !== best ? (
            <><br /><span style={{ color: "#a8a8b0" }}>v2.0 trade-off: RR={formatPct(tradeoff.mean.rr)}, FI={formatPct(tradeoff.mean.fi)}, EG={formatPct(tradeoff.mean.eg)}</span></>
          ) : null}
        </div>
        <div style={{ color: "#d7d7dd", fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: "#fff" }}>Search:</strong><br />
          random={searchSummary.random ?? 0}, elite={searchSummary.eliteMutation ?? 0}, bayesian={searchSummary.bayesianLite ?? 0}, pareto={result.redesign.pareto.length}
        </div>
        <div style={{ color: "#d7d7dd", fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: "#fff" }}>Hipotezy:</strong><br />
          H1: {hypotheses?.h1?.status || "n/a"}; H2: {hypotheses?.h2?.status || "n/a"}
        </div>
        <div style={{ color: "#d7d7dd", fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: "#fff" }}>Krzywa uczenia:</strong><br />
          {learningBest ? `najlepsze T_learn=${learningBest.roundsLearn}, Δselection=${formatSignedNumber(learningBest.selectionDelta)}` : "brak danych"}
        </div>
        <div style={{ color: "#d7d7dd", fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: "#fff" }}>Walidacja:</strong><br />
          testy {result.validation.passed}/{result.validation.total}; targetHits={best.targetHits}
        </div>
      </div>
    </div>
  );
}

function ExperimentHistory({ entries }) {
  const [activeId, setActiveId] = useState(entries[0]?.id || null);
  useEffect(() => {
    setActiveId(entries[0]?.id || null);
  }, [entries[0]?.id]);

  if (!entries.length) return null;
  const activeEntry = entries.find(entry => entry.id === activeId) || entries[0];

  return (
    <Box>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <Label>Historia iteracji ({entries.length})</Label>
        <HelpLink href="/help#autopilot">jak czytać?</HelpLink>
      </div>
      <div style={{ fontSize: 12, color: "#9696a0", lineHeight: 1.6, marginBottom: 10 }}>
        Tabela zawiera wszystkie przebiegi zebrane w bieżącej sesji. Kliknij wiersz, aby pokazać pełny zestaw wyników dla danego runu poniżej tabeli.
        Pełne obiekty wynikowe każdego przebiegu są dostępne w eksporcie JSON.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #35353b", color: "#9f9fa8", fontSize: 12 }}>
              <th style={thStyle}>Run</th>
              <th style={thStyle}>T_learn</th>
              <th style={thStyle}>T_eval</th>
              <th style={thStyle}>reps</th>
              <th style={thStyle}>seedBase</th>
              <th style={thStyle}>seedSearch</th>
              <th style={thStyle}>RR</th>
              <th style={thStyle}>EG</th>
              <th style={thStyle}>CR</th>
              <th style={thStyle}>FI</th>
              <th style={thStyle}>selection</th>
              <th style={thStyle}>H1</th>
              <th style={thStyle}>H2</th>
              <th style={thStyle}>v2.1 config</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => {
              const row = entry.summary;
              const active = entry.id === activeEntry?.id;
              return (
                <tr
                  key={entry.id}
                  tabIndex={0}
                  title="Kliknij, aby pokazać szczegóły tego runu"
                  onClick={() => setActiveId(entry.id)}
                  onFocus={() => setActiveId(entry.id)}
                  style={{
                    borderBottom: "1px solid #25252b",
                    background: active ? "rgba(139,124,246,0.12)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <td style={tdStyle}>#{row.id}</td>
                  <td style={tdStyle}>{row.inputs.roundsLearn}</td>
                  <td style={tdStyle}>{row.inputs.roundsEval}</td>
                  <td style={tdStyle}>{row.inputs.reps}</td>
                  <td style={tdStyle}>{row.inputs.seedBase}</td>
                  <td style={tdStyle}>{row.inputs.seedSearch}</td>
                  <td style={tdStyle}>{(row.rr * 100).toFixed(1)}%</td>
                  <td style={tdStyle}>{(row.eg * 100).toFixed(1)}%</td>
                  <td style={tdStyle}>{(row.cr * 100).toFixed(1)}%</td>
                  <td style={tdStyle}>{(row.fi * 100).toFixed(1)}%</td>
                  <td style={tdStyle}>{row.selectionScore.toFixed(3)}</td>
                  <td style={tdStyle}>{entry.hypotheses?.h1?.status || ""}</td>
                  <td style={tdStyle}>{entry.hypotheses?.h2?.status || ""}</td>
                  <td style={tdStyle}>α={row.cfg.alpha}, S={row.cfg.numFractions}, {row.cfg.allocationRule}, {row.cfg.stepType}, c={row.cfg.maxConcentration}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <RunDetail entry={activeEntry} />
    </Box>
  );
}

function SearchDiagnostics({ redesign }) {
  const summary = redesign.searchSummary || {};
  const stageRows = [
    ["random", "losowa eksploracja", summary.random || 0],
    ["elite-mutation", "mutacje elit", summary.eliteMutation || 0],
    ["bayesian-lite", "surrogate / TPE-like", summary.bayesianLite || 0],
  ];
  const bayesianBest = redesign.all.find(entry => entry.searchStage === "bayesian-lite");

  return (
    <Box>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <Label>Diagnostyka searchu</Label>
        <HelpLink href="/help#search">matematyka searchu</HelpLink>
      </div>
      <div style={{ fontSize: 12, color: "#a8a8b0", lineHeight: 1.6, marginBottom: 10 }}>
        Bayesian-lite nie zastępuje walidacji konfiguracji. Model zastępczy generuje kandydatów, a każdy z nich jest następnie mierzony tym samym symulatorem co explore/exploit.
        v2.1 wybiera najlepszy wariant z bramką RR ≥ {formatPct(redesign.revenueGate ?? REVENUE_GATE)}; jeżeli search nie znajdzie wariantu spełniającego bramkę, raportuje fallback.
        Reguła kroku adaptive ma karę ryzyka {((redesign.adaptivePenalty ?? ADAPTIVE_STEP_RISK_PENALTY) * 100).toFixed(1)} pp w rankingu v2.1, ale pozostaje widoczna w rankingu trade-off.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginBottom: 10 }}>
        {stageRows.map(([stage, label, count]) => (
          <div key={stage} style={{ background: "#111115", border: "1px solid #292932", borderRadius: 8, padding: 10 }}>
            <div style={{ color: "#86868f", fontSize: 10, textTransform: "uppercase" }}>{label}</div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{count}</div>
          </div>
        ))}
      </div>
      <FormulaLine>
        TPE-like: split history → elite set → density ratio ℓ(x)/g(x) + novelty → evaluate best candidates
      </FormulaLine>
      {bayesianBest ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#d7d7dd", lineHeight: 1.6 }}>
          Najlepszy kandydat z Bayesian-lite: selection <strong style={{ color: "#fff" }}>{bayesianBest.selectionScore.toFixed(3)}</strong>,
          acquisition <strong style={{ color: "#fff" }}>{(bayesianBest.acquisition ?? 0).toFixed(3)}</strong>,
          config α={bayesianBest.cfg.alpha}, S={bayesianBest.cfg.numFractions}, {bayesianBest.cfg.allocationRule}, {bayesianBest.cfg.stepType}, c={bayesianBest.cfg.maxConcentration}.
          <br />
          Kandydaci spełniający bramkę przychodową: <strong style={{ color: "#fff" }}>{redesign.revenueFeasibleCount ?? 0}</strong>; aktywny wariant: <strong style={{ color: "#fff" }}>{redesign.activeVersion || "RTZ v2.1 revenue-gated"}</strong>.
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 12, color: "#d7d7dd", lineHeight: 1.6 }}>
          Bayesian-lite jest nieaktywny dla tego przebiegu albo nie miał wystarczającej historii. Zwiększ `searchBayes`, aby oceniać kandydatów surrogate-assisted.
        </div>
      )}
    </Box>
  );
}

function HypothesisPanel({ data, archive }) {
  const assessment = buildHypothesisAssessment(data, archive);
  const rows = Object.values(assessment);
  const colorFor = item => item.supported ? "#2ecc71" : item.partial ? "#f0a030" : "#ff6b6b";
  const runCount = archive.length || 1;

  return (
    <Box accent="#4aa7ff40">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <Label>Ocena hipotez z autopilota</Label>
        <HelpLink href="/help#hypotheses">opis hipotez</HelpLink>
      </div>
      <div style={{ color: "#a8a8b0", fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
        Werdykt jest liczony na podstawie {runCount} {runCount === 1 ? "przebiegu" : "przebiegów"} zapisanych w historii sesji, a nie tylko ostatniego wyniku.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map(item => (
          <div key={item.label} style={{ background: "#111115", border: "1px solid #292932", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 6 }}>
              <div style={{ color: "#fff", fontWeight: 800 }}>{item.label}</div>
              <span style={{ color: colorFor(item), fontSize: 12, fontWeight: 800 }}>{item.status}</span>
            </div>
            <div style={{ color: "#d7d7dd", fontSize: 12, lineHeight: 1.55, marginBottom: 8 }}>{item.statement}</div>
            <div style={{ display: "grid", gap: 4 }}>
              {item.evidence.map(line => (
                <div key={line} style={{ color: "#a8a8b0", fontSize: 11, lineHeight: 1.45 }}>{line}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Box>
  );
}

function AutopilotSummary({ archive }) {
  if (!archive.length) return null;
  const validArchive = archive.filter(entry => entry.summary && entry.result);
  if (!validArchive.length) return null;
  const rows = validArchive.map(entry => entry.summary);
  const best = [...validArchive].sort((a, b) => b.summary.selectionScore - a.summary.selectionScore)[0];
  const feasibleRuns = rows.filter(row => row.rr >= REVENUE_GATE);
  const adaptiveRuns = rows.filter(row => row.cfg?.stepType === "adaptive").length;
  const metrics = [
    ["rr", "M1 Revenue Ratio", "max"],
    ["ae", "M2 Allocative Efficiency", "max"],
    ["eg", "M3 Exploitation Gap", "min"],
    ["cr", "M4 Completion Rate", "max"],
    ["fi", "M5 Fairness Index", "max"],
    ["selectionScore", "Fair-aware selection", "max"],
  ];
  const statusCount = key => validArchive.reduce((acc, entry) => {
    const status = entry.hypotheses?.[key]?.status || "brak";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const h1 = statusCount("h1");
  const h2 = statusCount("h2");

  return (
    <Box accent="#f0a03040">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <Label>Podsumowanie autopilota</Label>
        <div style={{ color: "#9b9ba6", fontSize: 12 }}>n={validArchive.length} przebiegów z bieżącej sesji</div>
      </div>
      <div style={{ color: "#c8c8cf", fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
        To jest agregacja po wszystkich zebranych wywołaniach autopilota. Szczegóły pojedynczego przebiegu są dostępne po kliknięciu wiersza w Historii iteracji.
      </div>
      <div style={{ background: "#111115", border: "1px solid #292932", borderRadius: 8, padding: 10, color: "#d7d7dd", fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
        <strong style={{ color: "#fff" }}>Co uzyskaliśmy:</strong> RTZ v2.1 rozdziela ranking mechanizmu na best feasible i best trade-off.
        Rekomendacja mechanizmu korzysta z best feasible, czyli najlepszego kandydata z RR ≥ {formatPct(REVENUE_GATE)}.
        Best trade-off pozostaje diagnostyką pokazującą, ile fairness/EG można uzyskać, jeśli dopuścić utratę przychodu.
        W tej historii {feasibleRuns.length}/{rows.length} runów spełnia bramkę RR, a adaptive wystąpił w {adaptiveRuns}/{rows.length} rekomendowanych konfiguracji.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #35353b" }}>
              <th style={thStyle}>Metryka</th>
              <th style={thStyle}>średnia ± sd</th>
              <th style={thStyle}>zakres</th>
              <th style={thStyle}>najlepszy run</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(([key, label, direction]) => {
              const values = rows.map(row => row[key]);
              const bestRow = [...rows].sort((a, b) => direction === "min" ? a[key] - b[key] : b[key] - a[key])[0];
              const pct = key !== "selectionScore";
              const fmt = value => pct ? formatPct(value) : value.toFixed(3);
              return (
                <tr key={key} style={{ borderBottom: "1px solid #25252b" }}>
                  <td style={tdStyle}>{label}</td>
                  <td style={tdStyle}>{fmt(mean(values))} ± {pct ? formatPct(sd(values)) : sd(values).toFixed(3)}</td>
                  <td style={tdStyle}>{fmt(Math.min(...values))} - {fmt(Math.max(...values))}</td>
                  <td style={tdStyle}>#{bestRow.id} ({fmt(bestRow[key])})</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 10 }}>
        <div style={{ background: "#111115", border: "1px solid #292932", borderRadius: 8, padding: 10, color: "#d7d7dd", fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: "#fff" }}>Najlepszy run wg selection:</strong><br />
          #{best.summary.id}, selection={best.summary.selectionScore.toFixed(3)}, RR={formatPct(best.summary.rr)}, FI={formatPct(best.summary.fi)}, EG={formatPct(best.summary.eg)}
        </div>
        <div style={{ background: "#111115", border: "1px solid #292932", borderRadius: 8, padding: 10, color: "#d7d7dd", fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: "#fff" }}>Konfiguracja v2.1 najlepszego runu:</strong><br />
          α={best.summary.cfg.alpha}, S={best.summary.cfg.numFractions}, {best.summary.cfg.allocationRule}, {best.summary.cfg.stepType}, c={best.summary.cfg.maxConcentration}
        </div>
        <div style={{ background: "#111115", border: "1px solid #292932", borderRadius: 8, padding: 10, color: "#d7d7dd", fontSize: 12, lineHeight: 1.55 }}>
          <strong style={{ color: "#fff" }}>Hipotezy w historii:</strong><br />
          H1: wsparta {h1.wsparta || 0}, częściowo {h1["częściowo wsparta"] || 0}, niewsparta {h1.niewsparta || 0}<br />
          H2: wsparta {h2.wsparta || 0}, częściowo {h2["częściowo wsparta"] || 0}, niewsparta {h2.niewsparta || 0}
        </div>
      </div>
    </Box>
  );
}

function Results({ data, archive, onApplyParams, onApplyAndRun, onAutoRun, autoRunLimit }) {
  const nextPlan = buildNextExperimentPlan(data);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <AutopilotSummary archive={archive} />

      <HypothesisPanel data={data} archive={archive} />

      <Box>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <Label>Walidacja symulatora</Label>
          <HelpLink href="/help#validation">co oznacza PASS?</HelpLink>
        </div>
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <Label>Ablacja względem v1.1 validated</Label>
          <HelpLink href="/help#ablation">po co ablacja?</HelpLink>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SimpleLineChart rows={data.ablation.alpha} metricKey="rr" title="alpha → Revenue Ratio" />
          <SimpleLineChart rows={data.ablation.maxConcentration} metricKey="fi" title="c_max → Fairness" />
          <SimpleLineChart rows={data.ablation.numFractions} metricKey="ae" title="S → Allocative Efficiency" />
          <SimpleLineChart rows={data.ablation.stepType} metricKey="cr" title="stepType → Completion" />
        </div>
      </Box>

      <LearningCurveTable data={data.learningCurve} />

      <SearchDiagnostics redesign={data.redesign} />

      <Box accent="#8b7cf640">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <Label>Następny eksperyment</Label>
          <HelpLink href="/help#autopilot">logika rekomendacji</HelpLink>
        </div>
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
            ["bayes", nextPlan.next.searchBayes],
            ["V", `${Math.round(nextPlan.next.tv / 1000)}k`],
            ["evals", `${2 + nextPlan.next.searchExplore + nextPlan.next.searchExploit + (nextPlan.next.searchBayes ?? 0) + (7 + 4 + 4 + 3 + 6) + learningRoundGrid(nextPlan.next.roundsLearn).length * 2}`],
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <Label>Eksport</Label>
          <HelpLink href="/help#exports">formaty</HelpLink>
        </div>
        <div style={{ color: "#d7d7dd", fontSize: 12, lineHeight: 1.55, marginBottom: 10 }}>
          Zebrano <strong style={{ color: "#fff" }}>{archive.length}</strong> przebiegów w bieżącej sesji. Eksport obejmuje wszystkie zapisane przebiegi autopilota.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={() => downloadText(buildCSV(data, archive), "rtz_rebuild_results.csv")}>
            Pobierz CSV z autopilotem
          </button>
          <button style={btnSecondary} onClick={() => downloadText(buildLaTeX(data), "rtz_rebuild_table.tex")}>
            Pobierz LaTeX
          </button>
          <button style={btnSecondary} onClick={() => downloadText(JSON.stringify(buildJSONExport(data, archive), null, 2), "rtz_rebuild_full.json")}>
            Pobierz pełny JSON
          </button>
          <button style={btnSecondary} onClick={() => downloadText(JSON.stringify({ generatedAt: new Date().toISOString(), runCount: archive.length, runs: archive }, null, 2), "rtz_autopilot_archive.json")}>
            Pobierz tylko autopilota
          </button>
        </div>
        <div style={{ color: "#9b9ba6", fontSize: 11, lineHeight: 1.5, marginTop: 8 }}>
          JSON zawiera ostatni pełny wynik, ocenę hipotez oraz pełną historię przebiegów autopilota zapisaną w tej sesji.
          CSV zawiera także tabelę `AUTOPILOT_RUNS` i kandydatów `AUTOPILOT_CANDIDATES`.
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
  const [searchBayes, setSearchBayes] = useState(experimentDefaults.searchBayes ?? 6);
  const [seedBase, setSeedBase] = useState(experimentDefaults.seedBase);
  const [seedSearch, setSeedSearch] = useState(experimentDefaults.seedSearch);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("Gotowe.");
  const [data, setData] = useState(null);
  const [runArchive, setRunArchive] = useState([]);
  const [autoMode, setAutoMode] = useState(false);
  const [autoRunLimit, setAutoRunLimit] = useState(DEFAULT_AUTOPILOT_RUN_LIMIT);
  const stopAutoRef = useRef(false);
  const storageReadyRef = useRef(false);
  const estimatedEvaluations = useMemo(() => {
    return 2 + searchExplore + searchExploit + searchBayes + (7 + 4 + 4 + 3 + 6) + learningRoundGrid(roundsLearn).length * 2;
  }, [roundsLearn, searchExplore, searchExploit, searchBayes]);

  const applyParamState = useCallback(next => {
    setNAgents(next.nAgents);
    setTv(next.tv);
    setRoundsLearn(next.roundsLearn);
    setRoundsEval(next.roundsEval);
    setReps(next.reps);
    setSearchExplore(next.searchExplore);
    setSearchExploit(next.searchExploit);
    setSearchBayes(next.searchBayes ?? 0);
    if (typeof next.seedBase === "number") setSeedBase(next.seedBase);
    if (typeof next.seedSearch === "number") setSeedSearch(next.seedSearch);
  }, []);

  useEffect(() => {
    const stored = readStoredSession();
    const restoredArchive = Array.isArray(stored?.runArchive)
      ? stored.runArchive
      : Array.isArray(stored?.autopilot?.runs)
        ? stored.autopilot.runs
        : [];
    const restoredData = stored?.data || stored?.latest || restoredArchive[0]?.result || null;

    if (restoredArchive.length) setRunArchive(restoredArchive);
    if (restoredData) {
      setData(restoredData);
      if (restoredData.inputs) applyParamState(restoredData.inputs);
      setPhase(`Przywrócono ${restoredArchive.length || 1} zapisanych przebiegów z bieżącej sesji.`);
    }
    storageReadyRef.current = true;
  }, [applyParamState]);

  useEffect(() => {
    if (!storageReadyRef.current) return;
    if (!data && !runArchive.length) return;
    writeStoredSession({
      savedAt: new Date().toISOString(),
      data,
      runArchive,
    });
  }, [data, runArchive]);

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
    searchBayes,
    ...overrides,
  }), [nAgents, tv, roundsLearn, roundsEval, reps, seedBase, seedSearch, searchExplore, searchExploit, searchBayes]);

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
      setRunArchive(prev => {
        const id = (prev[0]?.summary?.id || 0) + 1;
        const summary = summarizeRun(result, id);
        const draft = [{ id, generatedAt: result.generatedAt, summary, result }, ...prev];
        return draft.map((entry, idx) => idx === 0
          ? { ...entry, hypotheses: buildHypothesisAssessment(result, draft) }
          : entry);
      });

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
        <div
          className="rtz-hero-grid"
          style={{
            marginBottom: 16,
            display: "grid",
            gap: 14,
            alignItems: "start",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#8b7cf6", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              RTZ Auction Lab
            </div>
            <h1 style={{ fontSize: 30, lineHeight: 1.15, margin: 0 }}>
              Rebuild: legacy baseline, validated simulator, v2.1 redesign
            </h1>
            <div style={{ marginTop: 8, color: "#9b9ba6", maxWidth: 760, lineHeight: 1.65 }}>
              Celem aplikacji jest ocena, czy zmodyfikowana aukcja holenderska dla frakcjonalizowanych strumieni tantiem może utrzymać przychód sprzedającego,
              poprawić strukturę alokacji między segmentami rynku oraz ograniczyć przewagę strategii exploitacyjnych.
              {" "}
              <HelpLink href="/help#start">interpretacja</HelpLink>
              {" "}
              <HelpLink href="/help#domain">kontekst rynku</HelpLink>
            </div>
            <div
              className="rtz-hero-cards"
              style={{
                marginTop: 12,
                display: "grid",
                gap: 8,
              }}
            >
              {[
                ["Cel", "Porównać wariant historyczny, walidowany baseline i redesign mechanizmu."],
                ["Realizacja", "Symulator wykonuje uczenie, ewaluację i przeszukiwanie parametrów mechanizmu."],
                ["Hipoteza H1", "v2.1 może poprawić fairness i odporność bez zejścia poniżej RR ≥ 90%."],
                ["Hipoteza H2", "Dłuższe uczenie i Bayesian-lite powinny stabilizować wybór konfiguracji."],
              ].map(([label, text]) => (
                <div key={label} style={{ background: "#15151b", border: "1px solid #2c2c35", borderRadius: 8, padding: 10 }}>
                  <div style={{ color: "#8b7cf6", fontSize: 10, textTransform: "uppercase", fontWeight: 800 }}>{label}</div>
                  <div style={{ color: "#d7d7dd", fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{text}</div>
                </div>
              ))}
            </div>
          </div>
          <div
            className="rtz-quick-panel"
            style={{
              background: "#15151b",
              border: "1px solid #2c2c35",
              borderRadius: 8,
              padding: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 10, color: "#8b7cf6", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 800 }}>
                    Szybkie akcje
                  </div>
                  <HelpLink href="/help">Pomoc</HelpLink>
                </div>
                <div style={{ fontSize: 11, color: "#9b9ba6", marginTop: 2 }}>
                  {estimatedEvaluations} ewaluacji, reps={reps}
                  {" "}
                  <HelpLink href="/help#quick-actions">opis akcji</HelpLink>
                </div>
              </div>
              <StatusPill ok={!busy} text={busy ? "running" : "ready"} />
            </div>
            <button style={{ ...btnPrimary, padding: 11, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => handleRun()}>
              {busy ? "Trwa uruchomienie..." : "Uruchom eksperyment"}
            </button>
            <div style={{ display: "grid", gridTemplateColumns: autoMode ? "1fr 1fr" : "1fr", gap: 8 }}>
              <button
                style={{ ...btnSecondary, borderColor: "#2ecc71", color: "#fff", opacity: busy ? 0.7 : 1 }}
                disabled={busy}
                onClick={handleStartAutopilot}
              >
                Autopilot: {autoRunLimit}
              </button>
              {autoMode ? (
                <button style={{ ...btnSecondary, borderColor: "#f0a030", color: "#fff" }} onClick={handleStopAuto}>
                  Stop
                </button>
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: "#bdbdc6", lineHeight: 1.45, minHeight: 30 }}>
              {phase}
              {" "}
              <HelpLink href="/help#workflow">etapy</HelpLink>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <Box>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <Label>Parametry eksperymentu</Label>
                <HelpLink href="/help#parameters">opis parametrów</HelpLink>
              </div>
              <Slider label="Liczba agentów" hint="Populacja heterogenicznych agentów" tooltip="nAgents: liczba agentów w jednej populacji. Więcej agentów zwiększa różnorodność rynku i koszt symulacji." value={nAgents} min={10} max={60} step={5} onChange={setNAgents} display={String(nAgents)} />
              <Slider label="Wartość katalogu" hint="Wartość fundamentalna V w PLN" tooltip="V: wartość fundamentalna katalogu. M1 Revenue Ratio liczy RR = revenue / V." value={tv} min={10000} max={200000} step={10000} onChange={setTv} display={`${Math.round(tv / 1000)}k`} />
              <Slider label="T_learn" hint="Rundy uczenia w jednej repetycji" tooltip="T_learn: liczba rund aktualizacji Q. Qₐ ← Qₐ + (r − Qₐ) ÷ nₐ." value={roundsLearn} min={40} max={250} step={20} onChange={setRoundsLearn} display={String(roundsLearn)} />
              <Slider label="T_eval" hint="Rundy ewaluacji po uczeniu" tooltip="T_eval: liczba rund pomiaru po treningu. metric = (1 ÷ Tₑᵥₐₗ) · ∑ₜ metricₜ." value={roundsEval} min={20} max={140} step={10} onChange={setRoundsEval} display={String(roundsEval)} />
              <Slider label="Repetycje" hint="Ile seedów na konfigurację" tooltip="reps: liczba niezależnych seedów. x̄ = (1 ÷ reps) · ∑ᵣ xᵣ; sd = √(∑ᵣ(xᵣ − x̄)² ÷ (reps − 1))." value={reps} min={3} max={9} step={1} onChange={setReps} display={String(reps)} />
            </Box>

            <Box>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <Label>Redesign search</Label>
                <HelpLink href="/help#search">jak wybiera kandydatów?</HelpLink>
              </div>
              <Slider label="Eksploracja" hint="Losowe kandydackie konfiguracje" tooltip="searchExplore: liczba losowych konfiguracji mechanizmu. Nᶜᵃⁿᵈ = searchExplore + searchExploit + searchBayes." value={searchExplore} min={6} max={18} step={1} onChange={setSearchExplore} display={String(searchExplore)} />
              <Slider label="Eksploatacja" hint="Mutacje najlepszych kandydatów" tooltip="searchExploit: liczba mutacji elitarnych konfiguracji. Zwiększa lokalne przeszukanie wokół najlepszych wyników." value={searchExploit} min={8} max={24} step={1} onChange={setSearchExploit} display={String(searchExploit)} />
              <Slider label="Bayesian-lite" hint="Kandydaci z modelu zastępczego TPE-like" tooltip="searchBayes: liczba kandydatów proponowanych po explore/exploit przez surrogate-assisted search. Kandydaci są nadal pełnie ewaluowani symulatorem." value={searchBayes} min={0} max={18} step={1} onChange={setSearchBayes} display={String(searchBayes)} />
              <Slider label="Limit autopilota" hint="Maksymalna liczba kolejnych sugerowanych przebiegów w jednej serii; historia wyników nie jest ucinana" tooltip="Autopilot: runₖ → interpretacjaₖ → parametryₖ₊₁ → seedₖ₊₁ → runₖ₊₁. Limit zatrzymuje bieżącą serię po wskazanej liczbie przebiegów; archiwum zbiera wszystkie przebiegi z sesji." value={autoRunLimit} min={1} max={MAX_AUTOPILOT_BATCH_LIMIT} step={1} onChange={setAutoRunLimit} display={String(autoRunLimit)} />
              <div style={{ fontSize: 12, color: "#94949e", lineHeight: 1.6 }}>
                Szacowana liczba ewaluacji konfiguracji: <strong style={{ color: "#fff" }}>{estimatedEvaluations}</strong>.
                Każda ewaluacja to <strong style={{ color: "#fff" }}>{reps}</strong> repetycji. Dla validated i redesign obowiązuje polityka <strong style={{ color: "#fff" }}>S ≥ {MIN_VALIDATED_FRACTIONS}</strong>.
                Aktualne ziarna losowości: <strong style={{ color: "#fff" }}>seedBase={seedBase}</strong> / <strong style={{ color: "#fff" }}>seedSearch={seedSearch}</strong>.
              </div>
            </Box>

            <ParameterHints />

            <Box accent={busy ? "#8b7cf640" : "#33333b"}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <Label>Status</Label>
                <HelpLink href="/help#workflow">pipeline</HelpLink>
              </div>
              <div style={{ fontSize: 13, color: "#fff", marginBottom: 6 }}>{phase}</div>
              <div style={{ fontSize: 12, color: "#8e8e98", lineHeight: 1.6 }}>
                Pipeline: walidacja silnika → RTZ v1.0 legacy → RTZ v1.1 validated → search v2.1 z Bayesian-lite i bramką RR → ablacja → krzywa uczenia → eksport.
              </div>
            </Box>

            <MathHints />
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {!data && !busy ? (
              <Box>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <Label>Co się zmieniło</Label>
                  <HelpLink href="/help#versions">wersje RTZ</HelpLink>
                </div>
                <div style={{ fontSize: 14, color: "#d6d6dd", lineHeight: 1.75 }}>
                  <div>• v1.0 odtwarza historyczną logikę oryginalnego algorytmu, w tym jego ograniczenia implementacyjne,</div>
                  <div>• v1.1 wprowadza walidację budżetów, reguły clearingu i minimalnej granularności S ≥ 1000,</div>
                  <div>• v2.1 rozdziela best feasible od best trade-off: rekomendacją jest tylko kandydat z RR ≥ 90%, a trade-off zostaje diagnostyką,</div>
                  <div>• adaptive pozostaje w searchu, ale dostaje karę ryzyka w rankingu v2.1, bo w poprzednich przebiegach często podbijał FI kosztem RR,</div>
                  <div>• Bayesian-lite proponuje kandydatów na podstawie historii wyników, a każdy kandydat jest następnie oceniany pełną symulacją.</div>
                </div>
              </Box>
            ) : null}

            {busy ? (
              <Box accent="#8b7cf640">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <Label>Uruchomienie</Label>
                  <HelpLink href="/help#workflow">co teraz liczy?</HelpLink>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{phase}</div>
                <div style={{ fontSize: 12, color: "#90909a", lineHeight: 1.7 }}>
                  Aplikacja działa asynchronicznie, więc status odświeża się między kolejnymi blokami obliczeń.
                </div>
              </Box>
            ) : null}

            {data ? <Results data={data} archive={runArchive} onApplyParams={handleApplyParams} onApplyAndRun={handleApplyAndRun} onAutoRun={handleAutoRun} autoRunLimit={autoRunLimit} /> : null}

            <ExperimentHistory entries={runArchive} />
          </div>
        </div>
      </div>
    </div>
  );
}
