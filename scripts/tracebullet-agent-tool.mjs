#!/usr/bin/env node
import { runTraceBulletCommand } from "../src/cli.ts";

let input = "";

for await (const chunk of process.stdin) {
  input += chunk;
}

let request;

try {
  request = input.trim() ? JSON.parse(input) : {};
} catch {
  console.error(
    JSON.stringify({
      error: "Invalid JSON input. Expected {\"sentryIssueId\":\"CHECKOUT-4\",\"source\":\"coral\"}."
    })
  );
  process.exit(1);
}

const sentryIssueId = request.sentryIssueId;
const source = request.source ?? "local";

if (typeof sentryIssueId !== "string" || sentryIssueId.length === 0) {
  console.error(
    JSON.stringify({
      error: "Missing sentryIssueId. Expected {\"sentryIssueId\":\"CHECKOUT-4\",\"source\":\"coral\"}."
    })
  );
  process.exit(1);
}

if (source !== "local" && source !== "coral") {
  console.error(
    JSON.stringify({
      error: "Invalid source. Expected \"local\" or \"coral\"."
    })
  );
  process.exit(1);
}

const result = runTraceBulletCommand([
  "investigate",
  sentryIssueId,
  "--source",
  source,
  "--json"
]);

if (result.stderr) {
  console.error(JSON.stringify({ error: result.stderr }));
}

if (result.stdout) {
  process.stdout.write(result.stdout);
}

process.exitCode = result.exitCode;
