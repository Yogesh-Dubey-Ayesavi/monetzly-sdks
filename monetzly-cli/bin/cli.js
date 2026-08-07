#!/usr/bin/env node
import { readConfig, writeConfig, resolveConfig } from "../src/config.mjs";
import { getGlobalStateDir } from "../src/paths.mjs";
import { recordSignal } from "../src/workspace.mjs";

const [command, ...rest] = process.argv.slice(2);

function usage() {
  console.error(
    [
      "usage: monetzly <command>",
      "",
      "  config set-key <apiKey> [baseUrl]   store the API key (and optionally base URL)",
      "  config show                          print the resolved config (key redacted)",
      "  config path                          print the global config file path",
      "  signal <frustrated|neutral> <category> <phrase>",
      "                                        record a pain-point signal for the VSCode",
      "                                        extension to pick up, in the current directory",
    ].join("\n")
  );
  process.exit(1);
}

switch (command) {
  case "config": {
    const [subcommand, ...args] = rest;
    if (subcommand === "set-key") {
      const [apiKey, baseUrl] = args;
      if (!apiKey) usage();
      writeConfig({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
      console.log(`Saved to ${getGlobalStateDir()}`);
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
    const [mood, category, ...phraseParts] = rest;
    const text = phraseParts.join(" ");
    if ((mood !== "frustrated" && mood !== "neutral") || !category || !text) usage();
    const file = recordSignal({
      projectRoot: process.cwd(),
      sessionId: `manual-${Date.now()}`,
      mood,
      category,
      text,
      agentPrefix: "cli",
    });
    console.log(`Recorded to ${file}`);
    break;
  }
  default:
    usage();
}
