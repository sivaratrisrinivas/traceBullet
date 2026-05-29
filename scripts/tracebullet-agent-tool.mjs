#!/usr/bin/env node
import { runAgentToolRequest } from "../src/agentToolCore.ts";

let input = "";

for await (const chunk of process.stdin) {
  input += chunk;
}

const result = runAgentToolRequest(input);

if (result.stderr) {
  console.error(result.stderr);
}

if (result.stdout) {
  process.stdout.write(result.stdout);
}

process.exitCode = result.exitCode;
