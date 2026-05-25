import { fileURLToPath } from "node:url";
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

const USAGE = "Usage: node src/cli.ts investigate <SENTRY_ISSUE_ID> [--json]";

export function runTraceBulletCommand(args: string[]): CommandResult {
  const [command, sentryIssueId, ...flags] = args;
  const outputFormat = flags.includes("--json") ? "json" : "deterministic";

  if (command !== "investigate" || !sentryIssueId) {
    return {
      stdout: "",
      stderr: USAGE,
      exitCode: 1
    };
  }

  const report = investigateSentryIssue(sentryIssueId, localPrototypeData);

  if (!report) {
    return {
      stdout: "",
      stderr: `No investigation data found for Sentry Issue ID ${sentryIssueId}`,
      exitCode: 1
    };
  }

  return {
    stdout: outputFormat === "json" ? formatMachineReport(report) : formatDeterministicReport(report),
    stderr: "",
    exitCode: 0
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
