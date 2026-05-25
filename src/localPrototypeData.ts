export type SentryIssue = {
  id: string;
  title: string;
  serviceTag: string;
  firstSeenAt: string;
};

export type PullRequest = {
  number: number;
  title: string;
  author: string;
  serviceTag: string;
  mergedAt: string;
  mergeCommit: string;
};

export type SlackMessage = {
  channel: string;
  author: string;
  sentAt: string;
  text: string;
};

export type LocalPrototypeData = {
  sentryIssues: SentryIssue[];
  pullRequests: PullRequest[];
  slackMessages: SlackMessage[];
};

export const localPrototypeData: LocalPrototypeData = {
  sentryIssues: [
    {
      id: "SENTRY-TB-1001",
      title: "Checkout payment confirmation fails after submit",
      serviceTag: "checkout",
      firstSeenAt: "2026-05-25T10:35:00.000Z"
    }
  ],
  pullRequests: [
    {
      number: 41,
      title: "Prepare checkout retry copy",
      author: "maya",
      serviceTag: "checkout",
      mergedAt: "2026-05-25T10:10:00.000Z",
      mergeCommit: "b7f0a41"
    },
    {
      number: 42,
      title: "Route checkout confirmation through payment intent status",
      author: "niko",
      serviceTag: "checkout",
      mergedAt: "2026-05-25T10:30:00.000Z",
      mergeCommit: "f00db42"
    },
    {
      number: 43,
      title: "Tune catalog image cache",
      author: "sam",
      serviceTag: "catalog",
      mergedAt: "2026-05-25T10:32:00.000Z",
      mergeCommit: "cafe043"
    }
  ],
  slackMessages: [
    {
      channel: "#checkout-builds",
      author: "niko",
      sentAt: "2026-05-25T10:31:00.000Z",
      text: "Merged PR #42 for checkout confirmation handling; watching payment intent edge cases."
    }
  ]
};
