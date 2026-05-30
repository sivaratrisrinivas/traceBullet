#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const sources = [
  {
    name: "github",
    requiredKeys: ["GITHUB_TOKEN"]
  },
  {
    name: "sentry",
    requiredKeys: ["SENTRY_ORG", "SENTRY_TOKEN"]
  },
  {
    name: "slack",
    requiredKeys: ["SLACK_TOKEN"]
  }
];

process.env.TRACEBULLET_APP_HOST ??= "0.0.0.0";
process.env.TRACEBULLET_APP_PORT ??= process.env.PORT ?? "10000";
process.env.TRACEBULLET_CORAL_QUERY_COMMAND ??= "node";
process.env.TRACEBULLET_CORAL_QUERY_ARGS ??= "scripts/run-coral-sql.mjs";
process.env.CORAL_CONFIG_DIR ??= "/tmp/tracebullet-coral-config";

run("coral", ["--version"], {
  failureMessage: "Coral CLI is not available in the deployed runtime."
});

for (const source of sources) {
  const missingKeys = source.requiredKeys.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    console.error(
      JSON.stringify({
        component: "tracebullet-render-start",
        message: "coral.source.skipped",
        source: source.name,
        missingKeys
      })
    );
    continue;
  }

  run("coral", ["source", "add", source.name], {
    failureMessage: `Unable to configure Coral ${source.name} source.`
  });

  console.error(
    JSON.stringify({
      component: "tracebullet-render-start",
      message: "coral.source.ready",
      source: source.name
    })
  );
}

run("node", ["scripts/tracebullet-app-server.mjs"], {
  inherit: true,
  failureMessage: "TraceBullet app server exited."
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    shell: false
  });

  if (!options.inherit && result.stdout.trim()) {
    console.error(result.stdout.trim());
  }

  if (result.status === 0) {
    return;
  }

  if (!options.inherit && result.stderr.trim()) {
    console.error(result.stderr.trim());
  }

  console.error(options.failureMessage ?? `${command} ${args.join(" ")} failed.`);
  process.exit(result.status ?? 1);
}
