import { runTraceBulletCommand } from "./cli.ts";

export function runAgentToolRequest(input: string): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  let request: Record<string, unknown>;

  try {
    request = input.trim() ? JSON.parse(input) : {};
  } catch {
    return errorResult(
      "Invalid JSON input. Expected {\"sentryIssueId\":\"CHECKOUT-4\",\"source\":\"coral\"}."
    );
  }

  const sentryIssueId = request.sentryIssueId;
  const source = request.source ?? "local";
  const includeEnrichment = Boolean(request.includeEnrichment);
  const includeNarrative = Boolean(request.includeNarrative);

  if (typeof sentryIssueId !== "string" || sentryIssueId.length === 0) {
    return errorResult(
      "Missing sentryIssueId. Expected {\"sentryIssueId\":\"CHECKOUT-4\",\"source\":\"coral\"}."
    );
  }

  if (source !== "local" && source !== "coral") {
    return errorResult("Invalid source. Expected \"local\" or \"coral\".");
  }

  const commandArgs = [
    "investigate",
    sentryIssueId,
    "--source",
    source,
    "--json"
  ];

  if (includeEnrichment) {
    commandArgs.push("--enrich");
  }

  if (includeNarrative) {
    commandArgs.push("--narrative");
  }

  return runTraceBulletCommand(commandArgs);
}

function errorResult(message: string) {
  return {
    stdout: "",
    stderr: JSON.stringify({ error: message }),
    exitCode: 1
  };
}
