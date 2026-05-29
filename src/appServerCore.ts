import { runTraceBulletCommand } from "./cli.ts";

export type AppResponse = {
  status: number;
  body: Record<string, unknown>;
};

export function handleAppHealth(): AppResponse {
  return {
    status: 200,
    body: {
      ok: true,
      app: "tracebullet",
      investigationSourceOfTruth: "Investigation Command",
      localLlmMode: process.env.TRACEBULLET_NARRATIVE_MODE ?? "ollama-with-deterministic-fallback"
    }
  };
}

export function handleAppInvestigationRequest(
  input: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env
): AppResponse {
  const sentryIssueId = input.sentryIssueId;
  const source = input.source ?? "local";

  if (typeof sentryIssueId !== "string" || sentryIssueId.trim().length === 0) {
    return errorResponse(400, "Missing sentryIssueId.");
  }

  if (source !== "local" && source !== "coral") {
    return errorResponse(400, "Invalid source. Expected local or coral.");
  }

  const args = ["investigate", sentryIssueId.trim(), "--source", source, "--json"];

  if (input.includeEnrichment !== false) {
    args.push("--enrich");
  }

  if (input.includeNarrative !== false) {
    args.push("--narrative");
  }

  const result = runTraceBulletCommand(args, { env });

  if (result.exitCode !== 0) {
    return errorResponse(422, result.stderr || "TraceBullet investigation failed.");
  }

  return {
    status: 200,
    body: {
      report: JSON.parse(result.stdout)
    }
  };
}

function errorResponse(status: number, message: string): AppResponse {
  return {
    status,
    body: {
      error: message
    }
  };
}
