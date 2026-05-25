import { fileURLToPath } from "node:url";
import { localPrototypeData } from "./localPrototypeData.ts";
import {
  formatDeterministicReport,
  investigateSentryIssue
} from "./investigation.ts";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const USAGE = "Usage: node src/cli.ts investigate <SENTRY_ISSUE_ID>";

export function runTraceBulletCommand(args: string[]): CommandResult {
  const [command, sentryIssueId] = args;

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
    stdout: formatDeterministicReport(report),
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
