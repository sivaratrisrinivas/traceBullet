import { test } from "node:test";
import assert from "node:assert/strict";
import { runTraceBulletCommand } from "../src/cli.ts";

test("investigation command prints a deterministic report for a known Sentry issue", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1001"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /Deterministic Report/);
  assert.match(stdout, /Sentry issue/);
  assert.match(stdout, /SENTRY-TB-1001/);
  assert.match(stdout, /Suspected Causing PR/);
  assert.match(stdout, /#42/);
  assert.match(stdout, /checkout/);
  assert.match(stdout, /Evidence/);
  assert.match(stdout, /Service Match: checkout/);
  assert.match(stdout, /Time Match: merged 5 minutes before first seen/);
  assert.match(stdout, /Other Candidate PRs/);
  assert.match(stdout, /#41/);
  assert.match(stdout, /merged 25 minutes before first seen/);
  assert.match(stdout, /Suggested Revert Command/);
  assert.match(stdout, /git revert f00db42/);
  assert.match(stdout, /Query Representation/);
  assert.match(stdout, /Investigation Query Template/);
  assert.match(stdout, /exact Service Tag match/);
  assert.match(stdout, /30-minute Investigation Window/);
  assert.match(stdout, /Runtime/);
  assert.match(stdout, /source: Local Prototype Data/);
  assert.match(stdout, /duration: \d+ ms/);
});

test("investigation command prints a machine report when JSON output is requested", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1001",
    "--json"
  ]);

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.sentryIssue.id, "SENTRY-TB-1001");
  assert.equal(machineReport.sentryIssue.serviceTag, "checkout");
  assert.equal(machineReport.suspectedCausingPr.number, 42);
  assert.equal(machineReport.suspectedCausingPr.mergeCommit, "f00db42");
  assert.equal(machineReport.otherCandidatePrs.length, 1);
  assert.equal(machineReport.otherCandidatePrs[0].pullRequest.number, 41);
  assert.equal(machineReport.otherCandidatePrs[0].minutesBeforeFirstSeen, 25);
  assert.equal(machineReport.evidence.serviceMatch, "checkout");
  assert.equal(machineReport.evidence.minutesBeforeFirstSeen, 5);
  assert.equal(machineReport.evidence.slackContext.channel, "#checkout-builds");
  assert.equal(machineReport.queryRepresentation.source, "Investigation Query Template");
  assert.match(
    machineReport.queryRepresentation.description,
    /exact Service Tag match.*30-minute Investigation Window/
  );
  assert.equal(machineReport.runtime.source, "Local Prototype Data");
  assert.equal(machineReport.runtime.investigationWindowMinutes, 30);
  assert.equal(typeof machineReport.runtime.durationMs, "number");
  assert.ok(machineReport.runtime.durationMs >= 0);
});

test("investigation command can use Coral-backed Sandbox Sources for the same machine report", async () => {
  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--source",
      "coral",
      "--json"
    ],
    {
      runCoralQuery: () =>
        JSON.stringify({
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
              number: 42,
              title: "Route checkout confirmation through payment intent status",
              author: "niko",
              serviceTag: "checkout",
              mergedAt: "2026-05-25T10:30:00.000Z",
              mergeCommit: "f00db42"
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
        }),
      env: coralSandboxEnv()
    }
  );

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.sentryIssue.id, "SENTRY-TB-1001");
  assert.equal(machineReport.suspectedCausingPr.number, 42);
  assert.equal(machineReport.evidence.serviceMatch, "checkout");
  assert.equal(machineReport.evidence.minutesBeforeFirstSeen, 5);
  assert.equal(machineReport.evidence.slackContext.channel, "#checkout-builds");
  assert.equal(machineReport.queryRepresentation.source, "Live Coral Query");
  assert.match(machineReport.queryRepresentation.description, /github\.pulls/);
  assert.match(machineReport.queryRepresentation.description, /sentry\.issues/);
  assert.match(machineReport.queryRepresentation.description, /slack\.messages/);
  assert.equal(machineReport.runtime.source, "Coral Sandbox Sources");
});

test("investigation command normalizes Live Coral Query rows", async () => {
  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--source=coral",
      "--json"
    ],
    {
      runCoralQuery: () =>
        JSON.stringify([
          {
            recordSet: "sentryIssues",
            id: "SENTRY-TB-1001",
            title: "Checkout payment confirmation fails after submit",
            serviceTag: "checkout",
            firstSeenAt: "2026-05-25T10:35:00.000Z"
          },
          {
            recordSet: "pullRequests",
            number: 42,
            title: "Route checkout confirmation through payment intent status",
            author: "niko",
            serviceTag: "checkout",
            mergedAt: "2026-05-25T10:30:00.000Z",
            mergeCommit: "f00db42"
          },
          {
            recordSet: "slackMessages",
            channel: "#checkout-builds",
            author: "niko",
            sentAt: "2026-05-25T10:31:00.000Z",
            text: "Merged PR #42 for checkout confirmation handling; watching payment intent edge cases."
          }
        ]),
      env: coralSandboxEnv()
    }
  );

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.suspectedCausingPr.number, 42);
  assert.equal(machineReport.evidence.slackContext.channel, "#checkout-builds");
});

test("investigation command normalizes lowercase Live Coral Query row aliases", async () => {
  const result = runTraceBulletCommand(
    [
      "investigate",
      "CHECKOUT-1",
      "--source=coral",
      "--json"
    ],
    {
      runCoralQuery: () =>
        JSON.stringify([
          {
            recordset: "sentryIssues",
            id: "CHECKOUT-1",
            title: "Error: Test error for checkout project",
            servicetag: "checkout",
            firstseenat: "2026-05-27T19:54:17Z"
          }
        ]),
      env: coralSandboxEnv()
    }
  );

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.sentryIssue.id, "CHECKOUT-1");
  assert.equal(machineReport.sentryIssue.serviceTag, "checkout");
  assert.equal(machineReport.queryRepresentation.source, "Live Coral Query");
});

test("investigation command fails clearly when Coral source is not configured", async () => {
  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--source",
      "coral"
    ],
    {
      env: {}
    }
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /TRACEBULLET_CORAL_QUERY_COMMAND/);
  assert.match(result.stderr, /sandbox GitHub, Sentry, and Slack sources/);
});

test("direct Coral CLI usage defaults to the sandbox runner and source scope", async () => {
  let receivedEnv;

  const result = runTraceBulletCommand(
    [
      "investigate",
      "CHECKOUT-2",
      "--source",
      "coral",
      "--json"
    ],
    {
      runCoralQuery: (_query, env) => {
        receivedEnv = env;

        return JSON.stringify({
          sentryIssues: [
            {
              id: "CHECKOUT-2",
              title: "TraceBullet checkout sandbox error after PR #10",
              serviceTag: "checkout",
              firstSeenAt: "2026-05-27T20:16:40Z"
            }
          ],
          pullRequests: [],
          slackMessages: []
        });
      }
    }
  );

  assert.equal(result.exitCode, 0);
  assert.equal(receivedEnv.TRACEBULLET_CORAL_QUERY_COMMAND, process.execPath);
  assert.match(
    receivedEnv.TRACEBULLET_CORAL_QUERY_ARGS,
    /scripts\/run-coral-sql\.mjs$/
  );
  assert.equal(receivedEnv.TRACEBULLET_GITHUB_OWNER, "sivaratrisrinivas");
  assert.equal(receivedEnv.TRACEBULLET_GITHUB_REPO, "traceBullet");
  assert.equal(receivedEnv.TRACEBULLET_SLACK_CHANNEL_ID, "C0B689JN3L6");
});

test("investigation command fails clearly when Coral sandbox scope is missing", async () => {
  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--source",
      "coral"
    ],
    {
      env: {
        TRACEBULLET_CORAL_QUERY_COMMAND: "scripts/run-coral-sql.mjs"
      }
    }
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /TRACEBULLET_GITHUB_OWNER/);
  assert.match(result.stderr, /TRACEBULLET_GITHUB_REPO/);
  assert.match(result.stderr, /TRACEBULLET_SLACK_CHANNEL_ID/);
});

test("investigation command passes the Sentry Issue ID into the Live Coral Query", async () => {
  let receivedQuery = "";

  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--source",
      "coral",
      "--json"
    ],
    {
      runCoralQuery: (query) => {
        receivedQuery = query;

        return JSON.stringify({
          sentryIssues: [
            {
              id: "SENTRY-TB-1001",
              title: "Checkout payment confirmation fails after submit",
              serviceTag: "checkout",
              firstSeenAt: "2026-05-25T10:35:00.000Z"
            }
          ],
          pullRequests: [],
          slackMessages: []
        });
      },
      env: coralSandboxEnv()
    }
  );

  assert.equal(result.exitCode, 0);
  assert.match(receivedQuery, /FROM sentry\.issues/);
  assert.match(receivedQuery, /query = 'is:unresolved'/);
  assert.match(receivedQuery, /id = 'SENTRY-TB-1001'/);
  assert.match(receivedQuery, /short_id = 'SENTRY-TB-1001'/);
});

function coralSandboxEnv() {
  return {
    TRACEBULLET_CORAL_QUERY_COMMAND: "scripts/run-coral-sql.mjs",
    TRACEBULLET_GITHUB_OWNER: "sivaratrisrinivas",
    TRACEBULLET_GITHUB_REPO: "traceBullet",
    TRACEBULLET_SLACK_CHANNEL_ID: "C0B689JN3L6"
  };
}

test("investigation command shows missing Slack Context without failing a valid suspect", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1002"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /Suspected Causing PR/);
  assert.match(stdout, /#51/);
  assert.match(stdout, /Service Match: billing/);
  assert.match(stdout, /Time Match: merged 12 minutes before first seen/);
  assert.match(stdout, /Slack Context: missing/);
});

test("machine report excludes Slack Context without a pre-incident Slack Marker", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1002",
    "--json"
  ]);

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.suspectedCausingPr.number, 51);
  assert.equal(machineReport.evidence.serviceMatch, "billing");
  assert.equal(machineReport.evidence.minutesBeforeFirstSeen, 12);
  assert.equal(Object.hasOwn(machineReport.evidence, "slackContext"), false);
});

test("investigation command reports no suspect when only Time Match exists", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1003"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /No Suspected Causing PR Found/);
  assert.doesNotMatch(stdout, /Suspected Causing PR\n- PR:/);
  assert.match(stdout, /Missing Proof/);
  assert.match(stdout, /Service Match: missing/);
  assert.match(stdout, /Time Match: present/);
});

test("investigation command reports no suspect when only Service Match exists", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1004"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /No Suspected Causing PR Found/);
  assert.doesNotMatch(stdout, /Suspected Causing PR\n- PR:/);
  assert.match(stdout, /Missing Proof/);
  assert.match(stdout, /Service Match: present/);
  assert.match(stdout, /Time Match: missing/);
});

test("investigation command reports no suspect when neither required match exists", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1005"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /No Suspected Causing PR Found/);
  assert.doesNotMatch(stdout, /Suspected Causing PR\n- PR:/);
  assert.match(stdout, /Missing Proof/);
  assert.match(stdout, /Service Match: missing/);
  assert.match(stdout, /Time Match: missing/);
});

test("investigation command marks Suggested Revert Command unavailable when commit information is missing", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1006"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /Suspected Causing PR/);
  assert.match(stdout, /#61/);
  assert.match(stdout, /Suggested Revert Command/);
  assert.match(stdout, /unavailable: missing merge commit/);
  assert.doesNotMatch(stdout, /git revert\s*$/);
});
