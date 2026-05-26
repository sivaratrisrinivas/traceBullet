import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
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
  const env = options.env ?? process.env;

  if (command !== "investigate" || !sentryIssueId) {
    return {
      stdout: "",
      stderr: USAGE,
      exitCode: 1
    };
  }

  const startedAt = performance.now();
  const reportMetadata =
    source === "coral"
      ? {
          queryRepresentation: {
            source: "Live Coral Query" as const,
            description: buildLiveCoralInvestigationQuery(sentryIssueId)
          },
          runtimeSource: "Coral Sandbox Sources" as const
        }
      : undefined;

  let data = localPrototypeData;

  try {
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

function readSourceFlag(flags: string[]): "local" | "coral" {
  const sourceFlag = flags.find((flag) => flag.startsWith("--source="));

  if (sourceFlag) {
    return sourceFlag.replace("--source=", "") === "coral" ? "coral" : "local";
  }

  const sourceFlagIndex = flags.indexOf("--source");
  const sourceFlagValue = sourceFlagIndex >= 0 ? flags[sourceFlagIndex + 1] : undefined;

  return sourceFlagValue === "coral" ? "coral" : "local";
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
