#!/usr/bin/env node
import { readConfig, writeConfig, resolveConfig, isValidApiKey } from "../src/config.mjs";
import { getGlobalStateDir } from "../src/paths.mjs";
import { recordSignal, fireDecideAndPersist, adStatePath } from "../src/workspace.mjs";
import { capture } from "../src/analytics.mjs";
import { readFileSync } from "node:fs";

const [command, ...rest] = process.argv.slice(2);

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
      "                                        print the last ad fetched for that session, if any",
    ].join("\n")
  );
  process.exit(1);
}

// Pulls `--flag value` pairs out of argv, returning the rest as positionals.
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
  capture("cli_error", { command, err_type: err?.name || "Error" });
  console.error(err);
  process.exit(1);
});

async function main() {
capture("plugin_activated", { command });
switch (command) {
  case "config": {
    const [subcommand, ...args] = rest;
    if (subcommand === "set-key") {
      const [apiKey, baseUrl] = args;
      if (!apiKey) usage();
      if (!isValidApiKey(apiKey)) {
        console.error(`error: "${apiKey}" doesn't look like a Monetzly API key (expected mtzly_...)`);
        process.exit(1);
      }
      writeConfig({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
      console.log(`Saved to ${getGlobalStateDir()}`);
      await capture("config_set_key", { has_base_url: Boolean(baseUrl) });
      break;
    }
    if (subcommand === "show") {
      const resolved = resolveConfig();
      console.log(
        JSON.stringify(
          {
            ...resolved,
            apiKey: resolved.apiKey ? `${resolved.apiKey.slice(0, 10)}...` : null,
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
    if ((mood !== "frustrated" && mood !== "neutral") || !category || !text) usage();

    const projectRoot = flags.root || process.cwd();
    const sessionId = flags.session || `manual-${Date.now()}`;
    const agentPrefix = flags.agent || "cli";

    const file = recordSignal({ projectRoot, sessionId, mood, category, text, agentPrefix });
    console.log(`Recorded to ${file}`);
    await capture("signal_recorded", { mood, category, agent: agentPrefix });

    const { apiKey, baseUrl } = resolveConfig();
    // Node keeps this process alive for the pending fetch regardless, so
    // just await it directly (bounded by the 10s timeout inside) rather
    // than pretend it's detached.
    const decided = await fireDecideAndPersist({ projectRoot, sessionId, text, apiKey, baseUrl, agentPrefix });
    await capture("ad_decided", {
      decision: decided?.ad ? "serve" : "skip",
      brand: decided?.ad?.brand,
      agent: agentPrefix,
    });
    break;
  }
  case "ad": {
    const [subcommand, ...args] = rest;
    if (subcommand === "show") {
      const { flags } = parseFlags(args);
      const projectRoot = flags.root || process.cwd();
      const sessionId = flags.session;
      const agentPrefix = flags.agent || "cli";
      if (!sessionId) usage();
      const statePath = adStatePath(projectRoot, agentPrefix, sessionId);
      try {
        console.log(readFileSync(statePath, "utf8"));
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
