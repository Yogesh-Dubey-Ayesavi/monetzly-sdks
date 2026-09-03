#!/usr/bin/env node

// src/config.mjs
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");
var import_node_crypto = require("node:crypto");

// src/paths.mjs
var import_node_os = require("node:os");
var import_node_path = require("node:path");
function getGlobalStateDir() {
  const home = (0, import_node_os.homedir)();
  switch (process.platform) {
    case "darwin":
      return (0, import_node_path.join)(home, "Library", "Application Support", "monetzly");
    case "win32":
      return (0, import_node_path.join)(process.env.APPDATA || home, "monetzly");
    default:
      return (0, import_node_path.join)(process.env.XDG_CONFIG_HOME || (0, import_node_path.join)(home, ".config"), "monetzly");
  }
}
function getConfigPath() {
  return (0, import_node_path.join)(getGlobalStateDir(), "config.json");
}

// src/config.mjs
var DEFAULT_BASE_URL = "https://api.monetzly.com/v2";
function readConfig() {
  const configPath = getConfigPath();
  if (!(0, import_node_fs.existsSync)(configPath))
    return { apiKey: null, baseUrl: null };
  try {
    const parsed = JSON.parse((0, import_node_fs.readFileSync)(configPath, "utf8"));
    return { apiKey: parsed.apiKey ?? null, baseUrl: parsed.baseUrl ?? null };
  } catch {
    return { apiKey: null, baseUrl: null };
  }
}
function writeConfig(partial) {
  const configPath = getConfigPath();
  const dir = (0, import_node_path2.dirname)(configPath);
  (0, import_node_fs.mkdirSync)(dir, { recursive: true });
  const current = readConfig();
  const next = { ...current, ...partial };
  const tmpPath = `${configPath}.${(0, import_node_crypto.randomUUID)()}.tmp`;
  (0, import_node_fs.writeFileSync)(tmpPath, JSON.stringify(next, null, 2));
  (0, import_node_fs.renameSync)(tmpPath, configPath);
  return next;
}
function resolveConfig() {
  const stored = readConfig();
  const apiKey = process.env.MONETZLY_API_KEY || stored.apiKey || null;
  const baseUrl = (process.env.MONETZLY_BASE_URL || stored.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl, configured: typeof apiKey === "string" && /^mtzly_[A-Za-z0-9_-]+$/.test(apiKey) };
}

// src/workspace.mjs
var import_node_fs2 = require("node:fs");
var import_node_path3 = require("node:path");
var import_node_crypto2 = require("node:crypto");
function workspaceStateDir(projectRoot) {
  return (0, import_node_path3.join)((0, import_node_path3.resolve)(projectRoot), ".monetzly");
}
function ensureGitExcluded(projectRoot) {
  const gitDir = (0, import_node_path3.join)((0, import_node_path3.resolve)(projectRoot), ".git");
  if (!(0, import_node_fs2.existsSync)(gitDir))
    return;
  const excludePath = (0, import_node_path3.join)(gitDir, "info", "exclude");
  const entry = ".monetzly/";
  let current = "";
  try {
    current = (0, import_node_fs2.readFileSync)(excludePath, "utf8");
  } catch {
  }
  if (current.includes(entry))
    return;
  (0, import_node_fs2.mkdirSync)((0, import_node_path3.dirname)(excludePath), { recursive: true });
  (0, import_node_fs2.appendFileSync)(excludePath, (current.endsWith("\n") || !current ? "" : "\n") + entry + "\n");
}
function recordSignal({ projectRoot, sessionId, mood, category, text, agentPrefix = "cli" }) {
  ensureGitExcluded(projectRoot);
  const dir = (0, import_node_path3.join)(workspaceStateDir(projectRoot), "events");
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  const file = (0, import_node_path3.join)(dir, `${agentPrefix}-${sessionId}.jsonl`);
  const signal = {
    id: (0, import_node_crypto2.randomUUID)(),
    agent_id: `${agentPrefix}-${sessionId}`,
    session_id: sessionId,
    mood,
    category,
    text,
    ts: Date.now()
  };
  (0, import_node_fs2.appendFileSync)(file, JSON.stringify(signal) + "\n");
  return file;
}
function adStatePath(projectRoot, agentPrefix, sessionId) {
  return (0, import_node_path3.join)(workspaceStateDir(projectRoot), "ads", `${agentPrefix}-${sessionId}.json`);
}
async function fireDecideAndPersist({ projectRoot, sessionId, text, apiKey, baseUrl, agentPrefix = "cli" }) {
  const statePath = adStatePath(projectRoot, agentPrefix, sessionId);
  (0, import_node_fs2.mkdirSync)((0, import_node_path3.dirname)(statePath), { recursive: true });
  const writeAd = (ad, raw) => (0, import_node_fs2.writeFileSync)(statePath, JSON.stringify({ ad, raw, updatedAt: Date.now() }));
  if (!apiKey)
    return;
  try {
    const res = await fetch(`${baseUrl}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ protocol: 1, session_id: sessionId, turn: { kind: "raw_text", text } }),
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok)
      return writeAd(null, { error: `HTTP ${res.status}` });
    const data = await res.json();
    if (data?.decision === "serve" && data.ad) {
      writeAd({ id: data.ad.id, brand: data.ad.brand, copy: data.ad.approved_copy, url: data.ad.url }, data);
    } else {
      writeAd(null, data);
    }
  } catch (err) {
    writeAd(null, { error: String(err?.message || err) });
  }
}

// bin/cli.js
var import_node_fs3 = require("node:fs");
var [command, ...rest] = process.argv.slice(2);
function usage() {
  console.error(
    [
      "usage: monetzly <command>",
      "",
      "  config set-key <apiKey> [baseUrl]   store the API key (and optionally base URL)",
      "  config show                          print the resolved config (key redacted)",
      "  config path                          print the global config file path",
      "  signal <frustrated|neutral> <category> <phrase> [--root <path>] [--session <id>] [--agent <prefix>]",
      "                                        record a pain-point signal (default root: cwd,",
      "                                        default session: a fresh id, default agent: cli)",
      "                                        and fetch a matching ad in the background",
      "  ad show [--root <path>] [--session <id>] [--agent <prefix>]",
      "                                        print the last ad fetched for that session, if any"
    ].join("\n")
  );
  process.exit(1);
}
function parseFlags(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, flags };
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function main() {
  switch (command) {
    case "config": {
      const [subcommand, ...args] = rest;
      if (subcommand === "set-key") {
        const [apiKey, baseUrl] = args;
        if (!apiKey)
          usage();
        writeConfig({ apiKey, ...baseUrl ? { baseUrl } : {} });
        console.log(`Saved to ${getGlobalStateDir()}`);
        break;
      }
      if (subcommand === "show") {
        const resolved = resolveConfig();
        console.log(
          JSON.stringify(
            {
              ...resolved,
              apiKey: resolved.apiKey ? `${resolved.apiKey.slice(0, 10)}...` : null
            },
            null,
            2
          )
        );
        break;
      }
      if (subcommand === "path") {
        console.log(getGlobalStateDir());
        break;
      }
      usage();
      break;
    }
    case "signal": {
      const { positional, flags } = parseFlags(rest);
      const [mood, category, ...phraseParts] = positional;
      const text = phraseParts.join(" ").trim().slice(0, 140);
      if (mood !== "frustrated" && mood !== "neutral" || !category || !text)
        usage();
      const projectRoot = flags.root || process.cwd();
      const sessionId = flags.session || `manual-${Date.now()}`;
      const agentPrefix = flags.agent || "cli";
      const file = recordSignal({ projectRoot, sessionId, mood, category, text, agentPrefix });
      console.log(`Recorded to ${file}`);
      const { apiKey, baseUrl } = resolveConfig();
      await fireDecideAndPersist({ projectRoot, sessionId, text, apiKey, baseUrl, agentPrefix });
      break;
    }
    case "ad": {
      const [subcommand, ...args] = rest;
      if (subcommand === "show") {
        const { flags } = parseFlags(args);
        const projectRoot = flags.root || process.cwd();
        const sessionId = flags.session;
        const agentPrefix = flags.agent || "cli";
        if (!sessionId)
          usage();
        const statePath = adStatePath(projectRoot, agentPrefix, sessionId);
        try {
          console.log((0, import_node_fs3.readFileSync)(statePath, "utf8"));
        } catch {
          console.log(JSON.stringify({ ad: null }));
        }
        break;
      }
      usage();
      break;
    }
    default:
      usage();
  }
}
