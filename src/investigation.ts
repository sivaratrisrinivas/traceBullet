import type {
  LocalPrototypeData,
  PullRequest,
  SentryIssue,
  SlackMessage
} from "./localPrototypeData.ts";

const INVESTIGATION_WINDOW_MINUTES = 30;
const MS_PER_MINUTE = 60 * 1000;

export type InvestigationReport = {
  sentryIssue: SentryIssue;
  suspectedCausingPr: PullRequest;
  otherCandidatePrs: Array<{
    pullRequest: PullRequest;
    minutesBeforeFirstSeen: number;
  }>;
  evidence: {
    serviceMatch: string;
    minutesBeforeFirstSeen: number;
    slackContext?: SlackMessage;
  };
  runtime: {
    source: "Local Prototype Data";
    investigationWindowMinutes: number;
  };
};

export function investigateSentryIssue(
  sentryIssueId: string,
  data: LocalPrototypeData
): InvestigationReport | undefined {
  const sentryIssue = data.sentryIssues.find((issue) => issue.id === sentryIssueId);

  if (!sentryIssue) {
    return undefined;
  }

  const firstSeenAt = new Date(sentryIssue.firstSeenAt).getTime();
  const candidatePrs = data.pullRequests
    .map((pullRequest) => ({
      pullRequest,
      minutesBeforeFirstSeen: (firstSeenAt - new Date(pullRequest.mergedAt).getTime()) / MS_PER_MINUTE
    }))
    .filter(({ pullRequest, minutesBeforeFirstSeen }) => {
      return (
        pullRequest.serviceTag === sentryIssue.serviceTag &&
        minutesBeforeFirstSeen >= 0 &&
        minutesBeforeFirstSeen <= INVESTIGATION_WINDOW_MINUTES
      );
    })
    .sort((left, right) => left.minutesBeforeFirstSeen - right.minutesBeforeFirstSeen);

  const closestPriorCandidate = candidatePrs[0];

  if (!closestPriorCandidate) {
    return undefined;
  }

  const suspectedCausingPr = closestPriorCandidate.pullRequest;
  const slackContext = data.slackMessages.find((message) => {
    const sentAt = new Date(message.sentAt).getTime();
    return (
      sentAt <= firstSeenAt &&
      sentAt >= firstSeenAt - INVESTIGATION_WINDOW_MINUTES * MS_PER_MINUTE &&
      (message.text.includes(`#${suspectedCausingPr.number}`) ||
        message.text.includes(suspectedCausingPr.serviceTag) ||
        message.text.includes(suspectedCausingPr.mergeCommit))
    );
  });

  return {
    sentryIssue,
    suspectedCausingPr,
    otherCandidatePrs: candidatePrs.slice(1),
    evidence: {
      serviceMatch: sentryIssue.serviceTag,
      minutesBeforeFirstSeen: closestPriorCandidate.minutesBeforeFirstSeen,
      slackContext
    },
    runtime: {
      source: "Local Prototype Data",
      investigationWindowMinutes: INVESTIGATION_WINDOW_MINUTES
    }
  };
}

export function formatDeterministicReport(report: InvestigationReport): string {
  const { sentryIssue, suspectedCausingPr, otherCandidatePrs, evidence, runtime } = report;
  const slackContext = evidence.slackContext
    ? `${evidence.slackContext.channel} ${evidence.slackContext.sentAt} ${evidence.slackContext.text}`
    : "missing";
  const otherCandidateLines =
    otherCandidatePrs.length > 0
      ? otherCandidatePrs.flatMap(({ pullRequest, minutesBeforeFirstSeen }) => [
          `- PR: #${pullRequest.number}`,
          `  title: ${pullRequest.title}`,
          `  service tag: ${pullRequest.serviceTag}`,
          `  merged ${minutesBeforeFirstSeen} minutes before first seen`
        ])
      : ["- none"];

  return [
    "Deterministic Report",
    "",
    "Sentry issue",
    `- id: ${sentryIssue.id}`,
    `- title: ${sentryIssue.title}`,
    `- service tag: ${sentryIssue.serviceTag}`,
    `- first seen: ${sentryIssue.firstSeenAt}`,
    "",
    "Suspected Causing PR",
    `- PR: #${suspectedCausingPr.number}`,
    `- title: ${suspectedCausingPr.title}`,
    `- author: ${suspectedCausingPr.author}`,
    `- service tag: ${suspectedCausingPr.serviceTag}`,
    `- merged at: ${suspectedCausingPr.mergedAt}`,
    `- merge commit: ${suspectedCausingPr.mergeCommit}`,
    "",
    "Evidence",
    `- Service Match: ${evidence.serviceMatch}`,
    `- Time Match: merged ${evidence.minutesBeforeFirstSeen} minutes before first seen`,
    `- Slack Context: ${slackContext}`,
    "",
    "Other Candidate PRs",
    ...otherCandidateLines,
    "",
    "Runtime",
    `- source: ${runtime.source}`,
    `- investigation window: ${runtime.investigationWindowMinutes} minutes`
  ].join("\n");
}

export function formatMachineReport(report: InvestigationReport): string {
  return JSON.stringify(report, null, 2);
}
