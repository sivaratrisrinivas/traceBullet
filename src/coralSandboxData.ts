import { spawnSync } from "node:child_process";
import type { LocalPrototypeData } from "./localPrototypeData.ts";

const LIVE_CORAL_INVESTIGATION_QUERY_TEMPLATE = `
WITH target_sentry_issue AS (
  SELECT
    COALESCE(short_id, id) AS id,
    title,
    project AS serviceTag,
    first_seen AS firstSeenAt
  FROM sentry.issues
  WHERE query = 'is:unresolved'
    AND (id = '{{SENTRY_ISSUE_ID}}' OR short_id = '{{SENTRY_ISSUE_ID}}')
  LIMIT 1
),
sandbox_pull_requests AS (
  SELECT
    pull_requests.number,
    pull_requests.title,
    COALESCE(pull_requests.user__login, 'unknown') AS author,
    CASE
      WHEN pull_requests.label_names IS NULL THEN ''
      WHEN LOWER(',' || pull_requests.label_names || ',') LIKE '%,' || LOWER((SELECT serviceTag FROM target_sentry_issue)) || ',%'
        THEN (SELECT serviceTag FROM target_sentry_issue)
      ELSE pull_requests.label_names
    END AS serviceTag,
    pull_requests.merged_at AS mergedAt,
    pull_requests.merge_commit_sha AS mergeCommit
  FROM github.pulls AS pull_requests
  CROSS JOIN target_sentry_issue
  WHERE pull_requests.owner = '{{GITHUB_OWNER}}'
    AND pull_requests.repo = '{{GITHUB_REPO}}'
    AND pull_requests.state = 'closed'
    AND pull_requests.merged_at IS NOT NULL
  LIMIT 100
),
sandbox_slack_channel AS (
  SELECT
    id,
    name
  FROM slack.channels
  WHERE id = '{{SLACK_CHANNEL_ID}}'
  LIMIT 1
),
sandbox_slack_messages AS (
  SELECT
    '#' || sandbox_slack_channel.name AS channel,
    COALESCE(slack.users.display_name, slack.users.name, slack_messages.user_id, 'unknown') AS author,
    CAST(slack_messages.ts AS VARCHAR) AS sentAt,
    slack_messages.text
  FROM sandbox_slack_channel
  CROSS JOIN target_sentry_issue
  CROSS JOIN slack.messages(channel => '{{SLACK_CHANNEL_ID}}') AS slack_messages
  LEFT JOIN slack.users ON slack.users.id = slack_messages.user_id
  LIMIT 200
)
SELECT
  'sentryIssues' AS recordSet,
  id,
  title,
  serviceTag,
  firstSeenAt,
  CAST(NULL AS BIGINT) AS number,
  CAST(NULL AS VARCHAR) AS author,
  CAST(NULL AS VARCHAR) AS mergedAt,
  CAST(NULL AS VARCHAR) AS mergeCommit,
  CAST(NULL AS VARCHAR) AS channel,
  CAST(NULL AS VARCHAR) AS sentAt,
  CAST(NULL AS VARCHAR) AS text
FROM target_sentry_issue
UNION ALL
SELECT
  'pullRequests' AS recordSet,
  CAST(NULL AS VARCHAR) AS id,
  title,
  serviceTag,
  CAST(NULL AS VARCHAR) AS firstSeenAt,
  number,
  author,
  mergedAt,
  mergeCommit,
  CAST(NULL AS VARCHAR) AS channel,
  CAST(NULL AS VARCHAR) AS sentAt,
  CAST(NULL AS VARCHAR) AS text
FROM sandbox_pull_requests
UNION ALL
SELECT
  'slackMessages' AS recordSet,
  CAST(NULL AS VARCHAR) AS id,
  CAST(NULL AS VARCHAR) AS title,
  CAST(NULL AS VARCHAR) AS serviceTag,
  CAST(NULL AS VARCHAR) AS firstSeenAt,
  CAST(NULL AS BIGINT) AS number,
  author,
  CAST(NULL AS VARCHAR) AS mergedAt,
  CAST(NULL AS VARCHAR) AS mergeCommit,
  channel,
  sentAt,
  text
FROM sandbox_slack_messages;
`.trim();

export function buildLiveCoralInvestigationQuery(
  sentryIssueId: string,
  env: CoralQueryEnvironment = process.env
): string {
  const config = readCoralSandboxConfig(env);

  return LIVE_CORAL_INVESTIGATION_QUERY_TEMPLATE.replaceAll(
    "{{SENTRY_ISSUE_ID}}",
    escapeSqlLiteral(sentryIssueId)
  )
    .replaceAll("{{GITHUB_OWNER}}", escapeSqlLiteral(config.githubOwner))
    .replaceAll("{{GITHUB_REPO}}", escapeSqlLiteral(config.githubRepo))
    .replaceAll("{{SLACK_CHANNEL_ID}}", escapeSqlLiteral(config.slackChannelId));
}

function buildLiveCoralSentryIssueQuery(
  sentryIssueId: string,
  env: CoralQueryEnvironment
): string {
  readCoralSandboxConfig(env);

  return `
SELECT
  'sentryIssues' AS recordSet,
  COALESCE(short_id, id) AS id,
  title,
  project AS serviceTag,
  first_seen AS firstSeenAt
FROM sentry.issues
WHERE query = 'is:unresolved'
  AND (id = '${escapeSqlLiteral(sentryIssueId)}' OR short_id = '${escapeSqlLiteral(sentryIssueId)}')
LIMIT 1;
`.trim();
}

function buildLiveCoralPullRequestsQuery(
  serviceTag: string,
  env: CoralQueryEnvironment
): string {
  const config = readCoralSandboxConfig(env);
  const escapedServiceTag = escapeSqlLiteral(serviceTag);

  return `
SELECT
  'pullRequests' AS recordSet,
  pull_requests.number,
  pull_requests.title,
  COALESCE(pull_requests.user__login, 'unknown') AS author,
  CASE
    WHEN pull_requests.label_names IS NULL THEN ''
    WHEN LOWER(',' || pull_requests.label_names || ',') LIKE '%,${escapedServiceTag.toLowerCase()},%'
      THEN '${escapedServiceTag}'
    ELSE pull_requests.label_names
  END AS serviceTag,
  pull_requests.merged_at AS mergedAt,
  pull_requests.merge_commit_sha AS mergeCommit
FROM github.pulls AS pull_requests
WHERE pull_requests.owner = '${escapeSqlLiteral(config.githubOwner)}'
  AND pull_requests.repo = '${escapeSqlLiteral(config.githubRepo)}'
  AND pull_requests.state = 'closed'
  AND pull_requests.merged_at IS NOT NULL
LIMIT 100;
`.trim();
}

function buildLiveCoralSlackMessagesQuery(env: CoralQueryEnvironment): string {
  const config = readCoralSandboxConfig(env);

  return `
WITH sandbox_slack_channel AS (
  SELECT
    id,
    name
  FROM slack.channels
  WHERE id = '${escapeSqlLiteral(config.slackChannelId)}'
  LIMIT 1
)
SELECT
  'slackMessages' AS recordSet,
  '#' || sandbox_slack_channel.name AS channel,
  COALESCE(NULLIF(slack.users.display_name, ''), NULLIF(slack.users.name, ''), slack_messages.user_id, 'unknown') AS author,
  CAST(slack_messages.ts AS VARCHAR) AS sentAt,
  slack_messages.text
FROM sandbox_slack_channel
CROSS JOIN slack.messages(channel => '${escapeSqlLiteral(config.slackChannelId)}') AS slack_messages
LEFT JOIN slack.users ON slack.users.id = slack_messages.user_id
LIMIT 200;
`.trim();
}

export type CoralQueryEnvironment = NodeJS.ProcessEnv;
export type CoralQueryRunner = (query: string, env: CoralQueryEnvironment) => string;

export function loadCoralSandboxData(
  sentryIssueId: string,
  env: CoralQueryEnvironment,
  runCoralQuery: CoralQueryRunner = runConfiguredCoralQuery
): LocalPrototypeData {
  const sentryOutput = runCoralQuery(
    buildLiveCoralSentryIssueQuery(sentryIssueId, env),
    env
  );
  const legacyData = parseLegacyCoralData(sentryOutput);

  if (legacyData) {
    return legacyData;
  }

  const sentryIssues = normalizeCoralRows(JSON.parse(sentryOutput)).sentryIssues;

  if (sentryIssues.length === 0) {
    return {
      sentryIssues: [],
      pullRequests: [],
      slackMessages: []
    };
  }

  const targetSentryIssue = sentryIssues[0];
  const pullRequests = normalizeCoralRows(
    JSON.parse(runCoralQuery(buildLiveCoralPullRequestsQuery(targetSentryIssue.serviceTag, env), env))
  ).pullRequests;
  const slackMessages = normalizeCoralRows(
    JSON.parse(runCoralQuery(buildLiveCoralSlackMessagesQuery(env), env))
  ).slackMessages;

  return {
    sentryIssues,
    pullRequests,
    slackMessages
  };
}

function runConfiguredCoralQuery(query: string, env: CoralQueryEnvironment): string {
  const command = env.TRACEBULLET_CORAL_QUERY_COMMAND;
  const args = env.TRACEBULLET_CORAL_QUERY_ARGS?.split(" ").filter(Boolean) ?? [];

  if (!command) {
    throw new Error(
      "Coral source requires TRACEBULLET_CORAL_QUERY_COMMAND. Configure it to run Coral SQL against sandbox GitHub, Sentry, and Slack sources."
    );
  }

  readCoralSandboxConfig(env);

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

function readCoralSandboxConfig(env: CoralQueryEnvironment) {
  const requiredEntries = [
    ["TRACEBULLET_GITHUB_OWNER", env.TRACEBULLET_GITHUB_OWNER],
    ["TRACEBULLET_GITHUB_REPO", env.TRACEBULLET_GITHUB_REPO],
    ["TRACEBULLET_SLACK_CHANNEL_ID", env.TRACEBULLET_SLACK_CHANNEL_ID]
  ] as const;
  const missingKeys = requiredEntries
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(
      `Coral source requires sandbox scope: ${missingKeys.join(", ")}.`
    );
  }

  return {
    githubOwner: env.TRACEBULLET_GITHUB_OWNER,
    githubRepo: env.TRACEBULLET_GITHUB_REPO,
    slackChannelId: env.TRACEBULLET_SLACK_CHANNEL_ID
  };
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function parseLegacyCoralData(stdout: string): LocalPrototypeData | undefined {
  const parsed = JSON.parse(stdout);

  if (Array.isArray(parsed)) {
    return undefined;
  }

  if (
    parsed &&
    Array.isArray(parsed.sentryIssues) &&
    Array.isArray(parsed.pullRequests) &&
    Array.isArray(parsed.slackMessages)
  ) {
    return parsed;
  }

  throw new Error(
    "Coral query command must return JSON rows or sentryIssues, pullRequests, and slackMessages arrays."
  );
}

function normalizeCoralRows(rows: Array<Record<string, unknown>>): LocalPrototypeData {
  return {
    sentryIssues: rows
      .filter((row) => readCoralRowValue(row, "recordSet") === "sentryIssues")
      .map((row) => ({
        id: String(readCoralRowValue(row, "id")),
        title: String(readCoralRowValue(row, "title")),
        serviceTag: String(readCoralRowValue(row, "serviceTag")),
        firstSeenAt: String(readCoralRowValue(row, "firstSeenAt"))
      })),
    pullRequests: rows
      .filter((row) => readCoralRowValue(row, "recordSet") === "pullRequests")
      .map((row) => ({
        number: Number(readCoralRowValue(row, "number")),
        title: String(readCoralRowValue(row, "title")),
        author: String(readCoralRowValue(row, "author")),
        serviceTag: String(readCoralRowValue(row, "serviceTag")),
        mergedAt: String(readCoralRowValue(row, "mergedAt")),
        mergeCommit:
          readCoralRowValue(row, "mergeCommit") === null ||
          readCoralRowValue(row, "mergeCommit") === undefined
            ? undefined
            : String(readCoralRowValue(row, "mergeCommit"))
      })),
    slackMessages: rows
      .filter((row) => readCoralRowValue(row, "recordSet") === "slackMessages")
      .map((row) => ({
        channel: String(readCoralRowValue(row, "channel")),
        author: String(readCoralRowValue(row, "author")),
        sentAt: String(readCoralRowValue(row, "sentAt")),
        text: String(readCoralRowValue(row, "text"))
      }))
  };
}

function readCoralRowValue(row: Record<string, unknown>, key: string): unknown {
  return row[key] ?? row[key.toLowerCase()];
}
