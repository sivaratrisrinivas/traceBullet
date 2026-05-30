import { buildTraceBulletCommandEnvironment, runTraceBulletCommand } from "./cli.ts";

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
      narrativeProvider: process.env.TRACEBULLET_NARRATIVE_PROVIDER ?? "ollama",
      narrativeMode: process.env.TRACEBULLET_NARRATIVE_MODE ?? "llm-with-deterministic-fallback"
    }
  };
}

export function handleAppInvestigationRequest(
  input: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env
): AppResponse {
  const sentryIssueId = input.sentryIssueId;
  const source = input.source ?? "local";
  const requestId = `tb-${Date.now().toString(36)}`;

  if (typeof sentryIssueId !== "string" || sentryIssueId.trim().length === 0) {
    return errorResponse(400, "Missing sentryIssueId.");
  }

  if (source !== "local" && source !== "coral") {
    return errorResponse(400, "Invalid source. Expected local or coral.");
  }

  const args = ["investigate", sentryIssueId.trim(), "--source", source, "--json"];
  const log = createPipelineLogger(requestId);

  log("app.request.received", {
    sentryIssueId: sentryIssueId.trim(),
    source,
    includeEnrichment: input.includeEnrichment !== false,
    includeNarrative: input.includeNarrative !== false
  });

  if (input.includeEnrichment !== false) {
    args.push("--enrich");
  }

  if (input.includeNarrative !== false) {
    args.push("--narrative");
  }

  const result = runTraceBulletCommand(args, {
    env: buildTraceBulletCommandEnvironment(source, env),
    log
  });

  if (result.exitCode !== 0) {
    log("app.request.failed", {
      status: 422,
      error: result.stderr || "TraceBullet investigation failed."
    });

    return errorResponse(422, result.stderr || "TraceBullet investigation failed.");
  }

  log("app.request.complete", { status: 200 });

  return {
    status: 200,
    body: {
      report: JSON.parse(result.stdout)
    }
  };
}

function createPipelineLogger(requestId: string) {
  return (message: string, fields: Record<string, unknown> = {}) => {
    console.error(
      JSON.stringify({
        at: new Date().toISOString(),
        requestId,
        component: "tracebullet-app",
        message,
        ...fields
      })
    );
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
