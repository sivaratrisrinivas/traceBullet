#!/usr/bin/env node
import { spawnSync } from "node:child_process";

let query = "";

for await (const chunk of process.stdin) {
  query += chunk;
}

const result = spawnSync("coral", ["sql", "--format", "json", query], {
  encoding: "utf8",
  shell: false
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(result.stderr.trim() || "coral sql failed");
  process.exit(result.status ?? 1);
}

process.stdout.write(result.stdout);
