import { spawnSync } from "node:child_process";
import type { LocalPrototypeData } from "./localPrototypeData.ts";

const LIVE_CORAL_INVESTIGATION_QUERY_TEMPLATE = `
WITH target_sentry_issue AS (
  SELECT
    issue_id AS id,
    title,
    service_tag AS serviceTag,
    first_seen_at AS firstSeenAt
  FROM sentry_sandbox_issues
  WHERE issue_id = '{{SENTRY_ISSUE_ID}}'
),
sandbox_pull_requests AS (
  SELECT
    number,
    title,
    author,
    service_tag AS serviceTag,
    merged_at AS mergedAt,
    merge_commit AS mergeCommit
  FROM github_sandbox_pull_requests
),
sandbox_slack_messages AS (
  SELECT
    channel,
    author,
    sent_at AS sentAt,
    text
  FROM slack_sandbox_messages
)
SELECT
  'sentryIssues' AS recordSet,
  id,
  title,
  serviceTag,
  firstSeenAt,
  NULL AS number,
  NULL AS author,
  NULL AS mergedAt,
  NULL AS mergeCommit,
  NULL AS channel,
  NULL AS sentAt,
  NULL AS text
FROM target_sentry_issue
UNION ALL
SELECT
  'pullRequests' AS recordSet,
  NULL AS id,
  title,
  serviceTag,
  NULL AS firstSeenAt,
  number,
  author,
  mergedAt,
  mergeCommit,
  NULL AS channel,
  NULL AS sentAt,
  NULL AS text
FROM sandbox_pull_requests
UNION ALL
SELECT
  'slackMessages' AS recordSet,
  NULL AS id,
  NULL AS title,
  NULL AS serviceTag,
  NULL AS firstSeenAt,
  NULL AS number,
  author,
  NULL AS mergedAt,
  NULL AS mergeCommit,
  channel,
  sentAt,
  text
FROM sandbox_slack_messages;
`.trim();

export function buildLiveCoralInvestigationQuery(sentryIssueId: string): string {
  return LIVE_CORAL_INVESTIGATION_QUERY_TEMPLATE.replace(
    "{{SENTRY_ISSUE_ID}}",
    sentryIssueId.replaceAll("'", "''")
  );
}

export type CoralQueryEnvironment = NodeJS.ProcessEnv;
export type CoralQueryRunner = (query: string, env: CoralQueryEnvironment) => string;

export function loadCoralSandboxData(
  sentryIssueId: string,
  env: CoralQueryEnvironment,
  runCoralQuery: CoralQueryRunner = runConfiguredCoralQuery
): LocalPrototypeData {
  return parseCoralQueryOutput(
    runCoralQuery(buildLiveCoralInvestigationQuery(sentryIssueId), env)
  );
}

function runConfiguredCoralQuery(query: string, env: CoralQueryEnvironment): string {
  const command = env.TRACEBULLET_CORAL_QUERY_COMMAND;
  const args = env.TRACEBULLET_CORAL_QUERY_ARGS?.split(" ").filter(Boolean) ?? [];

  if (!command) {
    throw new Error(
      "Coral source requires TRACEBULLET_CORAL_QUERY_COMMAND. Configure it to run Coral SQL against sandbox GitHub, Sentry, and Slack sources."
    );
  }

  const result = spawnSync(command, args, {
    input: query,
    encoding: "utf8",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Coral query command failed.");
  }

  return result.stdout;
}

function parseCoralQueryOutput(stdout: string): LocalPrototypeData {
  const parsed = JSON.parse(stdout);

  if (Array.isArray(parsed)) {
    return normalizeCoralRows(parsed);
  }

  if (
    !parsed ||
    !Array.isArray(parsed.sentryIssues) ||
    !Array.isArray(parsed.pullRequests) ||
    !Array.isArray(parsed.slackMessages)
  ) {
    throw new Error(
      "Coral query command must return JSON with sentryIssues, pullRequests, and slackMessages arrays."
    );
  }

  return parsed;
}

function normalizeCoralRows(rows: Array<Record<string, unknown>>): LocalPrototypeData {
  return {
    sentryIssues: rows
      .filter((row) => row.recordSet === "sentryIssues")
      .map((row) => ({
        id: String(row.id),
        title: String(row.title),
        serviceTag: String(row.serviceTag),
        firstSeenAt: String(row.firstSeenAt)
      })),
    pullRequests: rows
      .filter((row) => row.recordSet === "pullRequests")
      .map((row) => ({
        number: Number(row.number),
        title: String(row.title),
        author: String(row.author),
        serviceTag: String(row.serviceTag),
        mergedAt: String(row.mergedAt),
        mergeCommit:
          row.mergeCommit === null || row.mergeCommit === undefined
            ? undefined
            : String(row.mergeCommit)
      })),
    slackMessages: rows
      .filter((row) => row.recordSet === "slackMessages")
      .map((row) => ({
        channel: String(row.channel),
        author: String(row.author),
        sentAt: String(row.sentAt),
        text: String(row.text)
      }))
  };
}
