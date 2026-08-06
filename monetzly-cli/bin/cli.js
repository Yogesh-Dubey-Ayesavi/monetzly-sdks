#!/usr/bin/env node
import { readConfig, writeConfig, resolveConfig } from "../src/config.mjs";
import { getGlobalStateDir } from "../src/paths.mjs";

const [command, ...rest] = process.argv.slice(2);

function usage() {
  console.error(
    [
      "usage: monetzly <command>",
      "",
      "  config set-key <apiKey> [baseUrl]   store the API key (and optionally base URL)",
      "  config show                          print the resolved config (key redacted)",
      "  config path                          print the global config file path",
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
  default:
    usage();
}
