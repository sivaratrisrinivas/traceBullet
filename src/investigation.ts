import type {
  LocalPrototypeData,
  PullRequest,
  SentryIssue,
  SlackMessage
} from "./localPrototypeData.ts";

const INVESTIGATION_WINDOW_MINUTES = 30;
const MS_PER_MINUTE = 60 * 1000;
const LOCAL_PROTOTYPE_QUERY_REPRESENTATION = {
  source: "Investigation Query Template",
  description:
    "Find pull requests with an exact Service Tag match merged inside the 30-minute Investigation Window before first seen."
} as const;

export type InvestigationReport = {
  sentryIssue: SentryIssue;
  suspectedCausingPr?: PullRequest;
  otherCandidatePrs: Array<{
    pullRequest: PullRequest;
    minutesBeforeFirstSeen: number;
  }>;
  missingProof: {
    serviceMatch: boolean;
    timeMatch: boolean;
  };
  evidence: {
    serviceMatch?: string;
    minutesBeforeFirstSeen?: number;
    slackContext?: SlackMessage;
  };
  queryRepresentation: {
    source: "Investigation Query Template" | "Live Coral Query";
    description: string;
  };
  runtime: {
    source: "Local Prototype Data" | "Coral Sandbox Sources";
    coralQueryStrategy?: "Single Investigation Query" | "Staged Query Fallback";
    coralQueryFallbackReason?: string;
    investigationWindowMinutes: number;
    durationMs: number;
  };
  operationalEnrichment?: OperationalEnrichment;
  narrative?: NarrativeSummary;
};

export type OperationalEnrichment = {
  mode: "Live Coral Enrichment" | "Demo Enrichment Data" | "Unavailable";
  datadog?: {
    service: string;
    metric: string;
    observedAt: string;
    value: number;
    unit: string;
    summary: string;
  };
  pagerDuty?: {
    incidentId: string;
    title: string;
    status: string;
    urgency: string;
    triggeredAt: string;
    summary: string;
  };
  queryRepresentation?: {
    datadog?: string;
    pagerDuty?: string;
  };
  notes: string[];
};

export type NarrativeSummary = {
  mode: "Local LLM Narrative" | "Deterministic Narrative" | "Unavailable";
  model?: string;
  text: string;
  notes: string[];
};

export function investigateSentryIssue(
  sentryIssueId: string,
  data: LocalPrototypeData,
  durationMs = 0,
  reportMetadata = {
    queryRepresentation: LOCAL_PROTOTYPE_QUERY_REPRESENTATION,
    runtimeSource: "Local Prototype Data" as const
  }
): InvestigationReport | undefined {
  const sentryIssue = data.sentryIssues.find((issue) => issue.id === sentryIssueId);

  if (!sentryIssue) {
    return undefined;
  }

  const firstSeenAt = new Date(sentryIssue.firstSeenAt).getTime();
  const pullRequestsWithTiming = data.pullRequests.map((pullRequest) => ({
    pullRequest,
    minutesBeforeFirstSeen: (firstSeenAt - new Date(pullRequest.mergedAt).getTime()) / MS_PER_MINUTE
  }));
  const hasServiceMatch = pullRequestsWithTiming.some(
    ({ pullRequest }) => pullRequest.serviceTag === sentryIssue.serviceTag
  );
  const hasTimeMatch = pullRequestsWithTiming.some(
    ({ minutesBeforeFirstSeen }) =>
      minutesBeforeFirstSeen >= 0 && minutesBeforeFirstSeen <= INVESTIGATION_WINDOW_MINUTES
  );
  const candidatePrs = pullRequestsWithTiming
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
    return {
      sentryIssue,
      otherCandidatePrs: [],
      missingProof: {
        serviceMatch: !hasServiceMatch,
        timeMatch: !hasTimeMatch
      },
      evidence: {},
      queryRepresentation: reportMetadata.queryRepresentation,
      runtime: {
        source: reportMetadata.runtimeSource,
        investigationWindowMinutes: INVESTIGATION_WINDOW_MINUTES,
        durationMs
      }
    };
  }

  const suspectedCausingPr = closestPriorCandidate.pullRequest;
  const slackContext = data.slackMessages.find((message) => {
    const sentAt = new Date(message.sentAt).getTime();
    return (
      sentAt <= firstSeenAt &&
      sentAt >= firstSeenAt - INVESTIGATION_WINDOW_MINUTES * MS_PER_MINUTE &&
      (message.text.includes(`#${suspectedCausingPr.number}`) ||
        message.text.includes(suspectedCausingPr.serviceTag) ||
        (suspectedCausingPr.mergeCommit
          ? message.text.includes(suspectedCausingPr.mergeCommit)
          : false))
    );
  });

  return {
    sentryIssue,
    suspectedCausingPr,
    otherCandidatePrs: candidatePrs.slice(1),
    missingProof: {
      serviceMatch: false,
      timeMatch: false
    },
    evidence: {
      serviceMatch: sentryIssue.serviceTag,
      minutesBeforeFirstSeen: closestPriorCandidate.minutesBeforeFirstSeen,
      slackContext
    },
    queryRepresentation: reportMetadata.queryRepresentation,
    runtime: {
      source: reportMetadata.runtimeSource,
      investigationWindowMinutes: INVESTIGATION_WINDOW_MINUTES,
      durationMs
    }
  };
}

export function formatDeterministicReport(report: InvestigationReport): string {
  const {
    sentryIssue,
    suspectedCausingPr,
    otherCandidatePrs,
    evidence,
    queryRepresentation,
    runtime,
    operationalEnrichment,
    narrative
  } = report;
  const suspectedCausingPrLines = suspectedCausingPr
    ? [
        "Suspected Causing PR",
        `- PR: #${suspectedCausingPr.number}`,
        `- title: ${suspectedCausingPr.title}`,
        `- author: ${suspectedCausingPr.author}`,
        `- service tag: ${suspectedCausingPr.serviceTag}`,
        `- merged at: ${suspectedCausingPr.mergedAt}`,
        `- merge commit: ${suspectedCausingPr.mergeCommit ?? "missing"}`
      ]
    : ["No Suspected Causing PR Found"];
  const proofLines = suspectedCausingPr
    ? [
        "Evidence",
        `- Service Match: ${evidence.serviceMatch}`,
        `- Time Match: merged ${evidence.minutesBeforeFirstSeen} minutes before first seen`
      ]
    : [
        "Missing Proof",
        `- Service Match: ${report.missingProof.serviceMatch ? "missing" : "present"}`,
        `- Time Match: ${report.missingProof.timeMatch ? "missing" : "present"}`
      ];
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
  const suggestedRevertLines = suspectedCausingPr
    ? [
        "",
        "Suggested Revert Command",
        suspectedCausingPr.mergeCommit
          ? `- git revert ${suspectedCausingPr.mergeCommit}`
          : "- unavailable: missing merge commit"
      ]
    : [];
  const enrichmentLines = operationalEnrichment
    ? [
        "",
        "Operational Enrichment",
        `- mode: ${operationalEnrichment.mode}`,
        ...(operationalEnrichment.datadog
          ? [
              `- Datadog: ${operationalEnrichment.datadog.summary}`,
              `  metric: ${operationalEnrichment.datadog.metric}`,
              `  value: ${operationalEnrichment.datadog.value} ${operationalEnrichment.datadog.unit}`,
              `  observed at: ${operationalEnrichment.datadog.observedAt}`
            ]
          : ["- Datadog: unavailable"]),
        ...(operationalEnrichment.pagerDuty
          ? [
              `- PagerDuty: ${operationalEnrichment.pagerDuty.summary}`,
              `  incident: ${operationalEnrichment.pagerDuty.incidentId}`,
              `  status: ${operationalEnrichment.pagerDuty.status}`,
              `  triggered at: ${operationalEnrichment.pagerDuty.triggeredAt}`
            ]
          : ["- PagerDuty: unavailable"]),
        ...operationalEnrichment.notes.map((note) => `- note: ${note}`)
      ]
    : [];
  const narrativeLines = narrative
    ? [
        "",
        "Narrative Summary",
        `- mode: ${narrative.mode}`,
        ...(narrative.model ? [`- model: ${narrative.model}`] : []),
        `- text: ${narrative.text}`,
        ...narrative.notes.map((note) => `- note: ${note}`)
      ]
    : [];

  return [
    "Deterministic Report",
    "",
    "Sentry issue",
    `- id: ${sentryIssue.id}`,
    `- title: ${sentryIssue.title}`,
    `- service tag: ${sentryIssue.serviceTag}`,
    `- first seen: ${sentryIssue.firstSeenAt}`,
    "",
    ...suspectedCausingPrLines,
    "",
    ...proofLines,
    ...(suspectedCausingPr ? [`- Slack Context: ${slackContext}`] : []),
    "",
    "Other Candidate PRs",
    ...otherCandidateLines,
    ...suggestedRevertLines,
    "",
    "Query Representation",
    `- source: ${queryRepresentation.source}`,
    `- description: ${queryRepresentation.description}`,
    ...enrichmentLines,
    ...narrativeLines,
    "",
    "Runtime",
    `- source: ${runtime.source}`,
    ...(runtime.coralQueryStrategy ? [`- Coral query strategy: ${runtime.coralQueryStrategy}`] : []),
    ...(runtime.coralQueryFallbackReason
      ? [`- Coral query fallback reason: ${runtime.coralQueryFallbackReason}`]
      : []),
    `- investigation window: ${runtime.investigationWindowMinutes} minutes`,
    `- duration: ${runtime.durationMs} ms`
  ].join("\n");
}

export function formatMachineReport(report: InvestigationReport): string {
  return JSON.stringify(report, null, 2);
}
