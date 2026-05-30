import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
  type CoralSandboxData,
  type PipelineLogger,
  type CoralQueryRunner,
  buildLiveCoralInvestigationQuery,
  loadCoralSandboxData,
  runConfiguredCoralQuery
} from "./coralSandboxData.ts";
import { localPrototypeData } from "./localPrototypeData.ts";
import {
  formatDeterministicReport,
  formatMachineReport,
  investigateSentryIssue
} from "./investigation.ts";
import { addOperationalEnrichment } from "./operationalEnrichment.ts";
import { addNarrativeSummary } from "./narrative.ts";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const USAGE =
  "Usage: node src/cli.ts investigate <SENTRY_ISSUE_ID> [--json] [--source local|coral] [--enrich] [--narrative]";

export function runTraceBulletCommand(
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    runCoralQuery?: CoralQueryRunner;
    log?: PipelineLogger;
  } = {}
): CommandResult {
  const [command, sentryIssueId, ...flags] = args;
  const outputFormat = flags.includes("--json") ? "json" : "deterministic";
  const includeEnrichment = flags.includes("--enrich");
  const includeNarrative = flags.includes("--narrative");
  const source = readSourceFlag(flags);
  const env = buildTraceBulletCommandEnvironment(source, options.env);
  const log = options.log;

  if (command !== "investigate" || !sentryIssueId) {
    return {
      stdout: "",
      stderr: USAGE,
      exitCode: 1
    };
  }

  log?.("investigation_command.received", {
    sentryIssueId,
    source,
    outputFormat,
    includeEnrichment,
    includeNarrative
  });

  const startedAt = performance.now();
  let reportMetadata:
    | {
        queryRepresentation: {
          source: "Live Coral Query";
          description: string;
        };
        runtimeSource: "Coral Sandbox Sources";
      }
    | undefined;

  let data = localPrototypeData;

  try {
    log?.("investigation_command.environment.prepared", {
      source,
      coralEnabled: source === "coral",
      coralQueryCommand: source === "coral" ? env.TRACEBULLET_CORAL_QUERY_COMMAND : undefined,
      coralQueryArgs: source === "coral" ? env.TRACEBULLET_CORAL_QUERY_ARGS : undefined,
      githubOwner: source === "coral" ? env.TRACEBULLET_GITHUB_OWNER : undefined,
      githubRepo: source === "coral" ? env.TRACEBULLET_GITHUB_REPO : undefined,
      slackChannelId: source === "coral" ? env.TRACEBULLET_SLACK_CHANNEL_ID : undefined
    });

    if (source === "coral" && !options.runCoralQuery && !env.TRACEBULLET_CORAL_QUERY_COMMAND) {
      throw new Error(
        "Coral source requires TRACEBULLET_CORAL_QUERY_COMMAND. Configure it to run Coral SQL against sandbox GitHub, Sentry, and Slack sources."
      );
    }

    log?.("investigation_command.query_representation.build", {
      source: source === "coral" ? "Live Coral Query" : "Investigation Query Template"
    });

    reportMetadata =
      source === "coral"
        ? {
            queryRepresentation: {
              source: "Live Coral Query" as const,
              description: buildLiveCoralInvestigationQuery(sentryIssueId, env)
            },
            runtimeSource: "Coral Sandbox Sources" as const
          }
        : undefined;

    log?.("investigation_command.data_load.start", {
      source: source === "coral" ? "Coral Sandbox Sources" : "Local Prototype Data"
    });

    data =
      source === "coral"
        ? loadCoralSandboxData(sentryIssueId, env, options.runCoralQuery, log)
        : localPrototypeData;

    log?.("investigation_command.data_load.complete", {
      source: source === "coral" ? "Coral Sandbox Sources" : "Local Prototype Data",
      sentryIssueCount: data.sentryIssues.length,
      pullRequestCount: data.pullRequests.length,
      slackMessageCount: data.slackMessages.length,
      ...readCoralQueryStrategyRuntime(data)
    });
  } catch (error) {
    log?.("investigation_command.data_load.failed", {
      error: error instanceof Error ? error.message : "Failed to load investigation data."
    });

    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : "Failed to load investigation data.",
      exitCode: 1
    };
  }

  log?.("investigation_command.ranking.start", {
    sentryIssueId,
    investigationWindowMinutes: 30
  });

  const report = investigateSentryIssue(sentryIssueId, data, 0, reportMetadata);

  if (!report) {
    log?.("investigation_command.ranking.no_data", { sentryIssueId });

    return {
      stdout: "",
      stderr: `No investigation data found for Sentry Issue ID ${sentryIssueId}`,
      exitCode: 1
    };
  }

  let reportWithRuntime = {
    ...report,
    runtime: {
      ...report.runtime,
      ...readCoralQueryStrategyRuntime(data),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    }
  };

  log?.("investigation_command.ranking.complete", {
    suspectedCausingPr: report.suspectedCausingPr?.number ?? "none",
    serviceMatch: report.evidence.serviceMatch ?? "missing",
    timeMatchMinutes: report.evidence.minutesBeforeFirstSeen ?? "missing",
    slackContext: report.evidence.slackContext ? "attached" : "missing"
  });

  if (includeEnrichment) {
    log?.("investigation_command.enrichment.start", {
      liveEnrichmentEnabled: env.TRACEBULLET_ENABLE_LIVE_ENRICHMENTS === "true",
      hasCoralRunner: Boolean(options.runCoralQuery ?? readOptionalCoralRunner(env))
    });

    reportWithRuntime = addOperationalEnrichment(
      reportWithRuntime,
      env,
      options.runCoralQuery ?? readOptionalCoralRunner(env)
    );

    log?.("investigation_command.enrichment.complete", {
      mode: reportWithRuntime.operationalEnrichment?.mode ?? "Unavailable",
      hasDatadog: Boolean(reportWithRuntime.operationalEnrichment?.datadog),
      hasPagerDuty: Boolean(reportWithRuntime.operationalEnrichment?.pagerDuty)
    });
  }

  if (includeNarrative) {
    log?.("investigation_command.narrative.start", {
      mode: env.TRACEBULLET_NARRATIVE_MODE ?? "llm-with-deterministic-fallback",
      provider: env.TRACEBULLET_NARRATIVE_PROVIDER ?? "ollama",
      model:
        env.TRACEBULLET_NARRATIVE_PROVIDER === "gemini"
          ? env.TRACEBULLET_GEMINI_MODEL ?? "gemini-3.5-flash"
          : env.TRACEBULLET_OLLAMA_MODEL ?? "qwen3:0.6b",
      fallbackModel:
        env.TRACEBULLET_NARRATIVE_PROVIDER === "gemini"
          ? env.TRACEBULLET_GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash"
          : undefined,
      hasGeminiApiKey:
        env.TRACEBULLET_NARRATIVE_PROVIDER === "gemini"
          ? Boolean(env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY)
          : undefined
    });

    reportWithRuntime = addNarrativeSummary(reportWithRuntime, env);

    log?.("investigation_command.narrative.complete", {
      mode: reportWithRuntime.narrative?.mode ?? "Unavailable",
      provider: reportWithRuntime.narrative?.provider,
      model: reportWithRuntime.narrative?.model,
      notes: reportWithRuntime.narrative?.notes
    });
  }

  log?.("investigation_command.complete", {
    sentryIssueId,
    runtimeSource: reportWithRuntime.runtime.source,
    coralQueryStrategy: reportWithRuntime.runtime.coralQueryStrategy,
    durationMs: reportWithRuntime.runtime.durationMs
  });

  return {
    stdout:
      outputFormat === "json"
        ? formatMachineReport(reportWithRuntime)
        : formatDeterministicReport(reportWithRuntime),
    stderr: "",
    exitCode: 0
  };
}

function readCoralQueryStrategyRuntime(data: typeof localPrototypeData) {
  const coralQueryStrategy = (data as Partial<CoralSandboxData>).coralQueryStrategy;
  const coralQueryFallbackReason = (data as Partial<CoralSandboxData>).coralQueryFallbackReason;

  return {
    ...(coralQueryStrategy ? { coralQueryStrategy } : {}),
    ...(coralQueryFallbackReason ? { coralQueryFallbackReason } : {})
  };
}

function readSourceFlag(flags: string[]): "local" | "coral" {
  const sourceFlag = flags.find((flag) => flag.startsWith("--source="));

  if (sourceFlag) {
    return sourceFlag.replace("--source=", "") === "coral" ? "coral" : "local";
  }

  const sourceFlagIndex = flags.indexOf("--source");
  const sourceFlagValue = sourceFlagIndex >= 0 ? flags[sourceFlagIndex + 1] : undefined;

  return sourceFlagValue === "coral" ? "coral" : "local";
}

function readOptionalCoralRunner(env: NodeJS.ProcessEnv): CoralQueryRunner | undefined {
  return env.TRACEBULLET_CORAL_QUERY_COMMAND ? runConfiguredCoralQuery : undefined;
}

export function buildTraceBulletCommandEnvironment(
  source: "local" | "coral",
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  if (source !== "coral") {
    return baseEnv;
  }

  return {
    ...baseEnv,
    TRACEBULLET_CORAL_QUERY_COMMAND:
      baseEnv.TRACEBULLET_CORAL_QUERY_COMMAND ?? process.execPath,
    TRACEBULLET_CORAL_QUERY_ARGS:
      baseEnv.TRACEBULLET_CORAL_QUERY_ARGS ??
      fileURLToPath(new URL("../scripts/run-coral-sql.mjs", import.meta.url)),
    TRACEBULLET_GITHUB_OWNER:
      baseEnv.TRACEBULLET_GITHUB_OWNER ?? "sivaratrisrinivas",
    TRACEBULLET_GITHUB_REPO:
      baseEnv.TRACEBULLET_GITHUB_REPO ?? "traceBullet",
    TRACEBULLET_SLACK_CHANNEL_ID:
      baseEnv.TRACEBULLET_SLACK_CHANNEL_ID ?? "C0B689JN3L6"
  };
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const result = runTraceBulletCommand(process.argv.slice(2));

  if (result.stdout) {
    console.log(result.stdout);
  }

  if (result.stderr) {
    console.error(result.stderr);
  }

  process.exitCode = result.exitCode;
}
