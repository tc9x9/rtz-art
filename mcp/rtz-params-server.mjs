#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, "config", "experiment-defaults.json");

const DEFAULTS = {
  nAgents: 30,
  tv: 50000,
  roundsLearn: 120,
  roundsEval: 60,
  reps: 5,
  searchExplore: 10,
  searchExploit: 14,
  searchBayes: 6,
  seedBase: 1000,
  seedSearch: 424242,
};

const PARAM_SCHEMA = {
  nAgents: { type: "integer", min: 10, max: 60, step: 5, description: "Number of heterogeneous agents." },
  tv: { type: "integer", min: 10000, max: 200000, step: 10000, description: "Fundamental catalog value in PLN." },
  roundsLearn: { type: "integer", min: 40, max: 250, step: 20, description: "Learning rounds per repetition." },
  roundsEval: { type: "integer", min: 20, max: 140, step: 10, description: "Evaluation rounds after learning." },
  reps: { type: "integer", min: 3, max: 9, step: 1, description: "Seed repetitions per evaluated configuration." },
  searchExplore: { type: "integer", min: 6, max: 18, step: 1, description: "Random exploration candidates in redesign search." },
  searchExploit: { type: "integer", min: 8, max: 24, step: 1, description: "Elite mutations in redesign search." },
  searchBayes: { type: "integer", min: 0, max: 18, step: 1, description: "Bayesian-lite/TPE surrogate candidates in redesign search." },
  seedBase: { type: "integer", min: 0, max: 2147483647, step: 1, description: "Base seed for experiment evaluation." },
  seedSearch: { type: "integer", min: 0, max: 2147483647, step: 1, description: "Seed for redesign search." },
};

const PRESETS = {
  quick: {
    nAgents: 20,
    tv: 50000,
    roundsLearn: 40,
    roundsEval: 20,
    reps: 3,
    searchExplore: 6,
    searchExploit: 8,
    searchBayes: 0,
  },
  balanced: {
    nAgents: 30,
    tv: 50000,
    roundsLearn: 120,
    roundsEval: 60,
    reps: 5,
    searchExplore: 10,
    searchExploit: 14,
    searchBayes: 6,
  },
  deep: {
    nAgents: 50,
    tv: 100000,
    roundsLearn: 220,
    roundsEval: 120,
    reps: 7,
    searchExplore: 16,
    searchExploit: 22,
    searchBayes: 12,
  },
};

function readConfig() {
  if (!fs.existsSync(configPath)) return { ...DEFAULTS };
  const raw = fs.readFileSync(configPath, "utf8");
  return { ...DEFAULTS, ...JSON.parse(raw) };
}

function writeConfig(next) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
}

function validateValue(key, value) {
  const spec = PARAM_SCHEMA[key];
  if (!spec) throw new Error(`Unknown parameter: ${key}`);
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  if (value < spec.min || value > spec.max) {
    throw new Error(`${key} must be between ${spec.min} and ${spec.max}`);
  }
  if ((value - spec.min) % spec.step !== 0) {
    throw new Error(`${key} must use step ${spec.step} from ${spec.min}`);
  }
}

function validatePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("params must be an object");
  }
  Object.entries(patch).forEach(([key, value]) => validateValue(key, value));
}

function estimatedEvaluations(config) {
  const learningRounds = new Set([0, 40, 80, 120, 160, 220, config.roundsLearn]);
  const ablationCount = 7 + 4 + 4 + 3 + 6;
  return 2 + config.searchExplore + config.searchExploit + (config.searchBayes ?? 0) + ablationCount + learningRounds.size * 2;
}

function jsonText(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function toolList() {
  const parameterProperties = Object.fromEntries(
    Object.entries(PARAM_SCHEMA).map(([key, spec]) => [
      key,
      {
        type: "integer",
        minimum: spec.min,
        maximum: spec.max,
        description: `${spec.description} Step: ${spec.step}.`,
      },
    ])
  );

  return [
    {
      name: "get_experiment_params",
      description: "Read current RTZ experiment defaults and estimated evaluation count.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "set_experiment_params",
      description: "Patch RTZ experiment defaults. Values are validated against UI-safe bounds.",
      inputSchema: {
        type: "object",
        properties: {
          params: {
            type: "object",
            properties: parameterProperties,
            additionalProperties: false,
          },
        },
        required: ["params"],
        additionalProperties: false,
      },
    },
    {
      name: "reset_experiment_params",
      description: "Reset RTZ experiment defaults to the balanced baseline.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "apply_experiment_preset",
      description: "Apply one of the built-in presets: quick, balanced, deep.",
      inputSchema: {
        type: "object",
        properties: {
          preset: { type: "string", enum: Object.keys(PRESETS) },
        },
        required: ["preset"],
        additionalProperties: false,
      },
    },
    {
      name: "get_experiment_param_schema",
      description: "Read parameter bounds, steps, and preset definitions.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
}

async function callTool(name, args = {}) {
  if (name === "get_experiment_params") {
    const config = readConfig();
    return jsonText({ config, configPath, estimatedEvaluations: estimatedEvaluations(config) });
  }

  if (name === "set_experiment_params") {
    validatePatch(args.params);
    const current = readConfig();
    const config = { ...current, ...args.params };
    validatePatch(config);
    writeConfig(config);
    return jsonText({ config, configPath, estimatedEvaluations: estimatedEvaluations(config) });
  }

  if (name === "reset_experiment_params") {
    writeConfig(DEFAULTS);
    return jsonText({ config: DEFAULTS, configPath, estimatedEvaluations: estimatedEvaluations(DEFAULTS) });
  }

  if (name === "apply_experiment_preset") {
    const preset = args.preset;
    if (!PRESETS[preset]) throw new Error(`Unknown preset: ${preset}`);
    const current = readConfig();
    const config = { ...current, ...PRESETS[preset] };
    validatePatch(config);
    writeConfig(config);
    return jsonText({ preset, config, configPath, estimatedEvaluations: estimatedEvaluations(config) });
  }

  if (name === "get_experiment_param_schema") {
    return jsonText({ params: PARAM_SCHEMA, presets: PRESETS });
  }

  throw new Error(`Unknown tool: ${name}`);
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(id, error) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message: error instanceof Error ? error.message : String(error),
    },
  })}\n`);
}

async function handleMessage(message) {
  const { id, method, params = {} } = message;

  try {
    if (method === "initialize") {
      respond(id, {
        protocolVersion: params.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "rtz-params", version: "0.1.0" },
      });
      return;
    }

    if (method === "tools/list") {
      respond(id, { tools: toolList() });
      return;
    }

    if (method === "tools/call") {
      const result = await callTool(params.name, params.arguments || {});
      respond(id, result);
      return;
    }

    if (method === "ping") {
      respond(id, {});
      return;
    }

    if (id !== undefined) respondError(id, new Error(`Unsupported method: ${method}`));
  } catch (error) {
    if (id !== undefined) respondError(id, error);
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf("\n");

  while (newlineIndex >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) {
      try {
        void handleMessage(JSON.parse(line));
      } catch (error) {
        respondError(null, error);
      }
    }
    newlineIndex = buffer.indexOf("\n");
  }
});

process.stdin.on("end", () => process.exit(0));
