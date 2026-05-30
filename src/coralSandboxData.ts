import { spawnSync } from "node:child_process";
import type { LocalPrototypeData } from "./localPrototypeData.ts";

const LIVE_CORAL_INVESTIGATION_QUERY_TEMPLATE = `
WITH target_sentry_issue AS (
  SELECT
    CAST(COALESCE(short_id, id) AS VARCHAR) AS id,
    CAST(title AS VARCHAR) AS title,
    CAST(project AS VARCHAR) AS serviceTag,
    CAST(first_seen AS VARCHAR) AS firstSeenAt
  FROM sentry.issues
  WHERE query = 'is:unresolved'
    AND (id = '{{SENTRY_ISSUE_ID}}' OR short_id = '{{SENTRY_ISSUE_ID}}')
  LIMIT 1
),
sandbox_pull_requests AS (
  SELECT
    pull_requests.number,
    CAST(pull_requests.title AS VARCHAR) AS title,
    CAST(COALESCE(pull_requests.user__login, 'unknown') AS VARCHAR) AS author,
    CAST(target_sentry_issue.serviceTag AS VARCHAR) AS serviceTag,
    CAST(pull_requests.merged_at AS VARCHAR) AS mergedAt,
    CAST(pull_requests.merge_commit_sha AS VARCHAR) AS mergeCommit
  FROM github.pulls AS pull_requests
  CROSS JOIN target_sentry_issue
  WHERE pull_requests.owner = '{{GITHUB_OWNER}}'
    AND pull_requests.repo = '{{GITHUB_REPO}}'
    AND pull_requests.state = 'closed'
    AND pull_requests.merged_at IS NOT NULL
    AND LOWER(',' || COALESCE(pull_requests.label_names, '') || ',') LIKE '%,' || LOWER(target_sentry_issue.serviceTag) || ',%'
    AND CAST(pull_requests.merged_at AS TIMESTAMP) BETWEEN
      CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP) - INTERVAL '30 minutes'
      AND CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP)
  ORDER BY CAST(pull_requests.merged_at AS TIMESTAMP) DESC
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
    CAST('#' || sandbox_slack_channel.name AS VARCHAR) AS channel,
    CAST(COALESCE(NULLIF(slack.users.display_name, ''), NULLIF(slack.users.name, ''), slack_messages.user_id, 'unknown') AS VARCHAR) AS author,
    CAST(slack_messages.ts AS VARCHAR) AS sentAt,
    CAST(slack_messages.text AS VARCHAR) AS text
  FROM sandbox_slack_channel
  CROSS JOIN target_sentry_issue
  CROSS JOIN slack.messages(channel => '{{SLACK_CHANNEL_ID}}') AS slack_messages
  LEFT JOIN slack.users ON slack.users.id = slack_messages.user_id
  LEFT JOIN sandbox_pull_requests ON
    slack_messages.text LIKE '%#' || CAST(sandbox_pull_requests.number AS VARCHAR) || '%'
    OR (
      sandbox_pull_requests.mergeCommit IS NOT NULL
      AND slack_messages.text LIKE '%' || sandbox_pull_requests.mergeCommit || '%'
    )
  WHERE CAST(slack_messages.ts AS TIMESTAMP) BETWEEN
      CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP) - INTERVAL '30 minutes'
      AND CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP)
    AND (
      LOWER(slack_messages.text) LIKE '%' || LOWER(target_sentry_issue.serviceTag) || '%'
      OR sandbox_pull_requests.number IS NOT NULL
    )
  ORDER BY sentAt DESC
  LIMIT 200
)
SELECT
  'sentryIssues' AS recordSet,
  CAST(id AS VARCHAR) AS id,
  CAST(title AS VARCHAR) AS title,
  CAST(serviceTag AS VARCHAR) AS serviceTag,
  CAST(firstSeenAt AS VARCHAR) AS firstSeenAt,
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
  CAST(title AS VARCHAR) AS title,
  CAST(serviceTag AS VARCHAR) AS serviceTag,
  CAST(NULL AS VARCHAR) AS firstSeenAt,
  number,
  CAST(author AS VARCHAR) AS author,
  CAST(mergedAt AS VARCHAR) AS mergedAt,
  CAST(mergeCommit AS VARCHAR) AS mergeCommit,
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
  CAST(author AS VARCHAR) AS author,
  CAST(NULL AS VARCHAR) AS mergedAt,
  CAST(NULL AS VARCHAR) AS mergeCommit,
  CAST(channel AS VARCHAR) AS channel,
  CAST(sentAt AS VARCHAR) AS sentAt,
  CAST(text AS VARCHAR) AS text
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
  targetSentryIssue: LocalPrototypeData["sentryIssues"][number],
  env: CoralQueryEnvironment
): string {
  const config = readCoralSandboxConfig(env);
  const escapedServiceTag = escapeSqlLiteral(targetSentryIssue.serviceTag);
  const escapedFirstSeenAt = escapeSqlLiteral(targetSentryIssue.firstSeenAt);

  return `
WITH target_sentry_issue AS (
  SELECT
    '${escapedServiceTag}' AS serviceTag,
    '${escapedFirstSeenAt}' AS firstSeenAt
)
SELECT
  'pullRequests' AS recordSet,
  pull_requests.number,
  pull_requests.title,
  COALESCE(pull_requests.user__login, 'unknown') AS author,
  target_sentry_issue.serviceTag,
  pull_requests.merged_at AS mergedAt,
  pull_requests.merge_commit_sha AS mergeCommit
FROM github.pulls AS pull_requests
CROSS JOIN target_sentry_issue
WHERE pull_requests.owner = '${escapeSqlLiteral(config.githubOwner)}'
  AND pull_requests.repo = '${escapeSqlLiteral(config.githubRepo)}'
  AND pull_requests.state = 'closed'
  AND pull_requests.merged_at IS NOT NULL
  AND LOWER(',' || COALESCE(pull_requests.label_names, '') || ',') LIKE '%,' || LOWER(target_sentry_issue.serviceTag) || ',%'
  AND CAST(pull_requests.merged_at AS TIMESTAMP) BETWEEN
    CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP) - INTERVAL '30 minutes'
    AND CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP)
ORDER BY CAST(pull_requests.merged_at AS TIMESTAMP) DESC
LIMIT 100;
`.trim();
}

function buildLiveCoralSlackMessagesQuery(
  targetSentryIssue: LocalPrototypeData["sentryIssues"][number],
  env: CoralQueryEnvironment
): string {
  const config = readCoralSandboxConfig(env);
  const escapedServiceTag = escapeSqlLiteral(targetSentryIssue.serviceTag);
  const escapedFirstSeenAt = escapeSqlLiteral(targetSentryIssue.firstSeenAt);

  return `
WITH target_sentry_issue AS (
  SELECT
    '${escapedServiceTag}' AS serviceTag,
    '${escapedFirstSeenAt}' AS firstSeenAt
),
candidate_pull_requests AS (
  SELECT
    pull_requests.number,
    pull_requests.merge_commit_sha AS mergeCommit
  FROM github.pulls AS pull_requests
  CROSS JOIN target_sentry_issue
  WHERE pull_requests.owner = '${escapeSqlLiteral(config.githubOwner)}'
    AND pull_requests.repo = '${escapeSqlLiteral(config.githubRepo)}'
    AND pull_requests.state = 'closed'
    AND pull_requests.merged_at IS NOT NULL
    AND LOWER(',' || COALESCE(pull_requests.label_names, '') || ',') LIKE '%,' || LOWER(target_sentry_issue.serviceTag) || ',%'
    AND CAST(pull_requests.merged_at AS TIMESTAMP) BETWEEN
      CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP) - INTERVAL '30 minutes'
      AND CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP)
  LIMIT 100
),
sandbox_slack_channel AS (
  SELECT
    id,
    name
  FROM slack.channels
  WHERE id = '${escapeSqlLiteral(config.slackChannelId)}'
  LIMIT 1
)
SELECT DISTINCT
  'slackMessages' AS recordSet,
  '#' || sandbox_slack_channel.name AS channel,
  COALESCE(NULLIF(slack.users.display_name, ''), NULLIF(slack.users.name, ''), slack_messages.user_id, 'unknown') AS author,
  CAST(slack_messages.ts AS VARCHAR) AS sentAt,
  slack_messages.text
FROM sandbox_slack_channel
CROSS JOIN target_sentry_issue
CROSS JOIN slack.messages(channel => '${escapeSqlLiteral(config.slackChannelId)}') AS slack_messages
LEFT JOIN slack.users ON slack.users.id = slack_messages.user_id
LEFT JOIN candidate_pull_requests ON
  slack_messages.text LIKE '%#' || CAST(candidate_pull_requests.number AS VARCHAR) || '%'
  OR (
    candidate_pull_requests.mergeCommit IS NOT NULL
    AND slack_messages.text LIKE '%' || candidate_pull_requests.mergeCommit || '%'
  )
WHERE CAST(slack_messages.ts AS TIMESTAMP) BETWEEN
    CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP) - INTERVAL '30 minutes'
    AND CAST(target_sentry_issue.firstSeenAt AS TIMESTAMP)
  AND (
    LOWER(slack_messages.text) LIKE '%' || LOWER(target_sentry_issue.serviceTag) || '%'
    OR candidate_pull_requests.number IS NOT NULL
  )
ORDER BY sentAt DESC
LIMIT 200;
`.trim();
}

export type CoralQueryEnvironment = NodeJS.ProcessEnv;
export type CoralQueryRunner = (query: string, env: CoralQueryEnvironment) => string;
export type CoralQueryStrategy = "Single Investigation Query" | "Staged Query Fallback";
export type PipelineLogger = (message: string, fields?: Record<string, unknown>) => void;
export type CoralSandboxData = LocalPrototypeData & {
  coralQueryStrategy: CoralQueryStrategy;
  coralQueryFallbackReason?: string;
};

export function loadCoralSandboxData(
  sentryIssueId: string,
  env: CoralQueryEnvironment,
  runCoralQuery: CoralQueryRunner = runConfiguredCoralQuery,
  log?: PipelineLogger
): CoralSandboxData {
  try {
    log?.("coral.single_query.start", {
      sentryIssueId,
      githubOwner: env.TRACEBULLET_GITHUB_OWNER,
      githubRepo: env.TRACEBULLET_GITHUB_REPO,
      slackChannelId: env.TRACEBULLET_SLACK_CHANNEL_ID
    });

    const data = loadSingleQueryCoralSandboxData(sentryIssueId, env, runCoralQuery);

    log?.("coral.single_query.complete", readDataCounts(data));

    return data;
  } catch (error) {
    log?.("coral.single_query.failed", {
      reason: readErrorMessage(error),
      fallback: "Staged Query Fallback"
    });

    const stagedData = loadStagedCoralSandboxData(sentryIssueId, env, runCoralQuery, log);

    log?.("coral.staged_query.complete", readDataCounts(stagedData));

    return {
      ...stagedData,
      coralQueryFallbackReason: readErrorMessage(error)
    };
  }
}

function loadSingleQueryCoralSandboxData(
  sentryIssueId: string,
  env: CoralQueryEnvironment,
  runCoralQuery: CoralQueryRunner
): CoralSandboxData {
  const output = runCoralQuery(buildLiveCoralInvestigationQuery(sentryIssueId, env), env);
  const legacyData = parseLegacyCoralData(output);

  if (legacyData) {
    return {
      ...legacyData,
      coralQueryStrategy: "Single Investigation Query"
    };
  }

  return {
    ...normalizeCoralRows(JSON.parse(output)),
    coralQueryStrategy: "Single Investigation Query"
  };
}

function loadStagedCoralSandboxData(
  sentryIssueId: string,
  env: CoralQueryEnvironment,
  runCoralQuery: CoralQueryRunner,
  log?: PipelineLogger
): CoralSandboxData {
  log?.("coral.staged_query.sentry.start", { sentryIssueId });

  const sentryOutput = runCoralQuery(
    buildLiveCoralSentryIssueQuery(sentryIssueId, env),
    env
  );
  const legacyData = parseLegacyCoralData(sentryOutput);

  if (legacyData) {
    return {
      ...legacyData,
      coralQueryStrategy: "Staged Query Fallback"
    };
  }

  const sentryIssues = normalizeCoralRows(JSON.parse(sentryOutput)).sentryIssues;

  log?.("coral.staged_query.sentry.complete", {
    sentryIssueCount: sentryIssues.length
  });

  if (sentryIssues.length === 0) {
    return {
      sentryIssues: [],
      pullRequests: [],
      slackMessages: [],
      coralQueryStrategy: "Staged Query Fallback"
    };
  }

  const targetSentryIssue = sentryIssues[0];

  log?.("coral.staged_query.pull_requests.start", {
    serviceTag: targetSentryIssue.serviceTag,
    firstSeenAt: targetSentryIssue.firstSeenAt
  });

  const pullRequests = normalizeCoralRows(
    JSON.parse(runCoralQuery(buildLiveCoralPullRequestsQuery(targetSentryIssue, env), env))
  ).pullRequests;

  log?.("coral.staged_query.pull_requests.complete", {
    pullRequestCount: pullRequests.length
  });

  log?.("coral.staged_query.slack.start", {
    slackChannelId: env.TRACEBULLET_SLACK_CHANNEL_ID
  });

  const slackMessages = normalizeCoralRows(
    JSON.parse(runCoralQuery(buildLiveCoralSlackMessagesQuery(targetSentryIssue, env), env))
  ).slackMessages;

  log?.("coral.staged_query.slack.complete", {
    slackMessageCount: slackMessages.length
  });

  return {
    sentryIssues,
    pullRequests,
    slackMessages,
    coralQueryStrategy: "Staged Query Fallback"
  };
}

function readDataCounts(data: LocalPrototypeData): Record<string, unknown> {
  return {
    sentryIssueCount: data.sentryIssues.length,
    pullRequestCount: data.pullRequests.length,
    slackMessageCount: data.slackMessages.length
  };
}

export function runConfiguredCoralQuery(query: string, env: CoralQueryEnvironment): string {
  const command = env.TRACEBULLET_CORAL_QUERY_COMMAND;
  const args = env.TRACEBULLET_CORAL_QUERY_ARGS?.split(" ").filter(Boolean) ?? [];

  if (!command) {
    throw new Error(
      "Coral source requires TRACEBULLET_CORAL_QUERY_COMMAND. Configure it to run Coral SQL against sandbox GitHub, Sentry, and Slack sources."
    );
  }

  readCoralSandboxConfig(env);

  const maxRetries = readNonNegativeInteger(env.TRACEBULLET_CORAL_QUERY_RETRIES, 1);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const result = spawnSync(command, args, {
      input: query,
      encoding: "utf8",
      shell: false
    });

    if (result.error) {
      lastError = result.error;
    } else if (result.status === 0) {
      return result.stdout;
    } else {
      lastError = new Error(result.stderr.trim() || "Coral query command failed.");
    }

    if (attempt >= maxRetries || !isRetryableCoralFailure(lastError.message)) {
      break;
    }

    wait(readNonNegativeInteger(env.TRACEBULLET_CORAL_RETRY_DELAY_MS, 1000));
  }

  throw lastError ?? new Error("Coral query command failed.");
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Coral query failure.";
}

export function isRetryableCoralFailure(message: string): boolean {
  return [
    "Source request timed out",
    "source API request timed out",
    "retryable",
    "The service is currently unavailable",
    "PROVIDER_REQUEST_FAILED"
  ].some((pattern) => message.includes(pattern));
}

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function wait(durationMs: number): void {
  if (durationMs <= 0) {
    return;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
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
