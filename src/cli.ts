import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
  type CoralSandboxData,
  type CoralQueryRunner,
  buildLiveCoralInvestigationQuery,
  loadCoralSandboxData
} from "./coralSandboxData.ts";
import { localPrototypeData } from "./localPrototypeData.ts";
import {
  formatDeterministicReport,
  formatMachineReport,
  investigateSentryIssue
} from "./investigation.ts";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const USAGE =
  "Usage: node src/cli.ts investigate <SENTRY_ISSUE_ID> [--json] [--source local|coral]";

export function runTraceBulletCommand(
  args: string[],
  options: { env?: NodeJS.ProcessEnv; runCoralQuery?: CoralQueryRunner } = {}
): CommandResult {
  const [command, sentryIssueId, ...flags] = args;
  const outputFormat = flags.includes("--json") ? "json" : "deterministic";
  const source = readSourceFlag(flags);
  const env = options.env ?? readDefaultCliEnvironment(source);

  if (command !== "investigate" || !sentryIssueId) {
    return {
      stdout: "",
      stderr: USAGE,
      exitCode: 1
    };
  }

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
    if (source === "coral" && !options.runCoralQuery && !env.TRACEBULLET_CORAL_QUERY_COMMAND) {
      throw new Error(
        "Coral source requires TRACEBULLET_CORAL_QUERY_COMMAND. Configure it to run Coral SQL against sandbox GitHub, Sentry, and Slack sources."
      );
    }

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
    data =
      source === "coral"
        ? loadCoralSandboxData(sentryIssueId, env, options.runCoralQuery)
        : localPrototypeData;
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : "Failed to load investigation data.",
      exitCode: 1
    };
  }

  const report = investigateSentryIssue(sentryIssueId, data, 0, reportMetadata);

  if (!report) {
    return {
      stdout: "",
      stderr: `No investigation data found for Sentry Issue ID ${sentryIssueId}`,
      exitCode: 1
    };
  }

  const reportWithRuntime = {
    ...report,
    runtime: {
      ...report.runtime,
      ...readCoralQueryStrategyRuntime(data),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    }
  };

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

function readDefaultCliEnvironment(source: "local" | "coral"): NodeJS.ProcessEnv {
  if (source !== "coral") {
    return process.env;
  }

  return {
    ...process.env,
    TRACEBULLET_CORAL_QUERY_COMMAND:
      process.env.TRACEBULLET_CORAL_QUERY_COMMAND ?? process.execPath,
    TRACEBULLET_CORAL_QUERY_ARGS:
      process.env.TRACEBULLET_CORAL_QUERY_ARGS ??
      fileURLToPath(new URL("../scripts/run-coral-sql.mjs", import.meta.url)),
    TRACEBULLET_GITHUB_OWNER:
      process.env.TRACEBULLET_GITHUB_OWNER ?? "sivaratrisrinivas",
    TRACEBULLET_GITHUB_REPO:
      process.env.TRACEBULLET_GITHUB_REPO ?? "traceBullet",
    TRACEBULLET_SLACK_CHANNEL_ID:
      process.env.TRACEBULLET_SLACK_CHANNEL_ID ?? "C0B689JN3L6"
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
