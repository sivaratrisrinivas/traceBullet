import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetryableCoralFailure } from "../src/coralSandboxData.ts";
import { buildTraceBulletCommandEnvironment, runTraceBulletCommand } from "../src/cli.ts";
import { handleMcpMessage } from "../src/mcpServerCore.ts";
import { runAgentToolRequest } from "../src/agentToolCore.ts";
import {
  handleAppHealth,
  handleAppInvestigationRequest
} from "../src/appServerCore.ts";

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

test("agent tool command shape uses the same machine report contract", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1001",
    "--source",
    "local",
    "--json"
  ]);

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.sentryIssue.id, "SENTRY-TB-1001");
  assert.equal(machineReport.suspectedCausingPr.number, 42);
  assert.equal(machineReport.runtime.source, "Local Prototype Data");
});

test("agent tool adapter can request enrichment and narrative", async () => {
  const previousMode = process.env.TRACEBULLET_NARRATIVE_MODE;

  process.env.TRACEBULLET_NARRATIVE_MODE = "deterministic";

  try {
    const result = runAgentToolRequest(
      JSON.stringify({
        sentryIssueId: "SENTRY-TB-1001",
        source: "local",
        includeEnrichment: true,
        includeNarrative: true
      })
    );

    assert.equal(result.exitCode, 0);

    const machineReport = JSON.parse(result.stdout);

    assert.equal(machineReport.operationalEnrichment.mode, "Demo Enrichment Data");
    assert.equal(machineReport.narrative.mode, "Deterministic Narrative");
  } finally {
    if (previousMode === undefined) {
      delete process.env.TRACEBULLET_NARRATIVE_MODE;
    } else {
      process.env.TRACEBULLET_NARRATIVE_MODE = previousMode;
    }
  }
});

test("investigation command can attach deterministic operational enrichment", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1001",
    "--json",
    "--enrich"
  ]);

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.operationalEnrichment.mode, "Demo Enrichment Data");
  assert.equal(machineReport.operationalEnrichment.datadog.service, "checkout");
  assert.equal(machineReport.operationalEnrichment.pagerDuty.urgency, "high");
  assert.match(
    machineReport.operationalEnrichment.notes[0],
    /Live Coral Enrichment is disabled/
  );
});

test("investigation command can attach live Coral operational enrichment rows", async () => {
  const enrichmentQueries = [];
  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--source",
      "coral",
      "--json",
      "--enrich"
    ],
    {
      runCoralQuery: (query) => {
        if (query.includes("datadogSignals")) {
          enrichmentQueries.push(query);

          return JSON.stringify([
            {
              recordSet: "datadogSignals",
              service: "checkout",
              metric: "tracebullet.error_rate",
              observedAt: "2026-05-25T10:34:00.000Z",
              value: 4.8,
              unit: "x baseline",
              summary: "Error-rate spike observed near the Sentry first-seen timestamp."
            }
          ]);
        }

        if (query.includes("pagerDutyIncidents")) {
          enrichmentQueries.push(query);

          return JSON.stringify([
            {
              recordSet: "pagerDutyIncidents",
              incidentId: "PD-CHECKOUT-SANDBOX",
              title: "Checkout fatal error spike",
              status: "triggered",
              urgency: "high",
              triggeredAt: "2026-05-25T10:35:00.000Z",
              summary: "PagerDuty incident overlaps the TraceBullet Investigation Window."
            }
          ]);
        }

        return JSON.stringify({
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
          slackMessages: []
        });
      },
      env: {
        ...coralSandboxEnv(),
        TRACEBULLET_ENABLE_LIVE_ENRICHMENTS: "true",
        TRACEBULLET_DATADOG_ENRICHMENT_QUERY:
          "SELECT 'datadogSignals' AS recordSet, '{{SERVICE_TAG}}' AS service;",
        TRACEBULLET_PAGERDUTY_ENRICHMENT_QUERY:
          "SELECT 'pagerDutyIncidents' AS recordSet, '{{SENTRY_ISSUE_ID}}' AS incidentId;"
      }
    }
  );

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.operationalEnrichment.mode, "Live Coral Enrichment");
  assert.equal(machineReport.operationalEnrichment.datadog.metric, "tracebullet.error_rate");
  assert.equal(machineReport.operationalEnrichment.pagerDuty.incidentId, "PD-CHECKOUT-SANDBOX");
  assert.equal(enrichmentQueries.length, 2);
  assert.match(enrichmentQueries[0], /checkout/);
  assert.match(enrichmentQueries[1], /SENTRY-TB-1001/);
});

test("live operational enrichment falls back when query templates are not configured", async () => {
  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--json",
      "--enrich"
    ],
    {
      runCoralQuery: () => {
        throw new Error("No enrichment query should be executed.");
      },
      env: {
        ...coralSandboxEnv(),
        TRACEBULLET_ENABLE_LIVE_ENRICHMENTS: "true"
      }
    }
  );

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.operationalEnrichment.mode, "Demo Enrichment Data");
  assert.match(
    machineReport.operationalEnrichment.notes.join(" "),
    /no Datadog or PagerDuty enrichment query template/
  );
});

test("investigation command can attach a deterministic narrative fallback", async () => {
  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--json",
      "--narrative"
    ],
    {
      env: {
        TRACEBULLET_NARRATIVE_MODE: "deterministic"
      }
    }
  );

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.narrative.mode, "Deterministic Narrative");
  assert.match(machineReport.narrative.text, /Suspected Causing PR/);
  assert.match(machineReport.narrative.text, /PR #42/);
  assert.doesNotMatch(machineReport.narrative.text, /root cause/i);
});

test("Gemini narrative provider falls back clearly when API key is missing", async () => {
  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--json",
      "--narrative"
    ],
    {
      env: {
        TRACEBULLET_NARRATIVE_PROVIDER: "gemini"
      }
    }
  );

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.narrative.mode, "Deterministic Narrative");
  assert.equal(machineReport.narrative.provider, "gemini");
  assert.equal(machineReport.narrative.model, "gemini-3.5-flash");
  assert.match(machineReport.narrative.notes.join(" "), /GEMINI_API_KEY/);
});

test("MCP server exposes the TraceBullet investigation tool over stdio", async () => {
  const responses = [
    handleMcpMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    }),
    handleMcpMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18"
      }
    }),
    handleMcpMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    }),
    handleMcpMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "tracebullet_investigate",
        arguments: {
          sentryIssueId: "SENTRY-TB-1001",
          source: "local",
          outputFormat: "json",
          includeNarrative: true
        }
      }
    })
  ];

  assert.equal(responses[0], undefined);
  assert.equal(responses[1].result.serverInfo.name, "tracebullet");
  assert.equal(responses[2].result.tools[0].name, "tracebullet_investigate");
  assert.match(responses[3].result.content[0].text, /SENTRY-TB-1001/);
  assert.match(responses[3].result.content[0].text, /Suspected Causing PR/);
  assert.equal(responses[3].result.structuredContent.report.sentryIssue.id, "SENTRY-TB-1001");
  assert.equal(responses[3].result.isError, false);
});

test("MCP server exposes domain resources and investigation prompt", async () => {
  const resourceList = handleMcpMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "resources/list"
  });
  const resourceRead = handleMcpMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "resources/read",
    params: {
      uri: "tracebullet://context/domain"
    }
  });
  const promptList = handleMcpMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "prompts/list"
  });
  const promptGet = handleMcpMessage({
    jsonrpc: "2.0",
    id: 4,
    method: "prompts/get",
    params: {
      name: "tracebullet_investigation_brief",
      arguments: {
        sentryIssueId: "SENTRY-TB-1001",
        source: "local"
      }
    }
  });

  assert.match(resourceList.result.resources[0].uri, /^tracebullet:\/\//);
  assert.match(resourceRead.result.contents[0].text, /Suspected Causing PR/);
  assert.equal(promptList.result.prompts[0].name, "tracebullet_investigation_brief");
  assert.match(promptGet.result.messages[0].content.text, /SENTRY-TB-1001/);
  assert.match(promptGet.result.messages[0].content.text, /includeNarrative=true/);
});

test("app API core runs investigation with narrative enabled by default", async () => {
  const health = handleAppHealth();
  const response = handleAppInvestigationRequest(
    {
      sentryIssueId: "SENTRY-TB-1001",
      source: "local"
    },
    {
      TRACEBULLET_NARRATIVE_MODE: "deterministic"
    }
  );

  assert.equal(health.status, 200);
  assert.equal(health.body.narrativeProvider, "ollama");
  assert.equal(response.status, 200);
  assert.equal(response.body.report.sentryIssue.id, "SENTRY-TB-1001");
  assert.equal(response.body.report.narrative.mode, "Deterministic Narrative");
  assert.equal(response.body.report.operationalEnrichment.mode, "Demo Enrichment Data");
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
  assert.equal(machineReport.runtime.coralQueryStrategy, "Single Investigation Query");
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

test("investigation command fails clearly when Coral command is explicitly disabled", async () => {
  const result = runTraceBulletCommand(
    [
      "investigate",
      "SENTRY-TB-1001",
      "--source",
      "coral"
    ],
    {
      env: {
        TRACEBULLET_CORAL_QUERY_COMMAND: ""
      }
    }
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /TRACEBULLET_CORAL_QUERY_COMMAND/);
  assert.match(result.stderr, /sandbox GitHub, Sentry, and Slack sources/);
});

test("app API Coral source uses default sandbox command environment", async () => {
  const env = buildTraceBulletCommandEnvironment("coral", {
    TRACEBULLET_NARRATIVE_MODE: "deterministic"
  });

  assert.equal(env.TRACEBULLET_NARRATIVE_MODE, "deterministic");
  assert.equal(env.TRACEBULLET_CORAL_QUERY_COMMAND, process.execPath);
  assert.match(env.TRACEBULLET_CORAL_QUERY_ARGS, /scripts\/run-coral-sql\.mjs$/);
  assert.equal(env.TRACEBULLET_GITHUB_OWNER, "sivaratrisrinivas");
  assert.equal(env.TRACEBULLET_GITHUB_REPO, "traceBullet");
  assert.equal(env.TRACEBULLET_SLACK_CHANNEL_ID, "C0B689JN3L6");
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
        TRACEBULLET_CORAL_QUERY_COMMAND: "scripts/run-coral-sql.mjs",
        TRACEBULLET_GITHUB_OWNER: "",
        TRACEBULLET_GITHUB_REPO: "",
        TRACEBULLET_SLACK_CHANNEL_ID: ""
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

test("Coral sandbox investigation query filters candidate PRs and Slack markers before TypeScript ranking", async () => {
  const receivedQueries = [];

  const result = runTraceBulletCommand(
    [
      "investigate",
      "CHECKOUT-4",
      "--source",
      "coral",
      "--json"
    ],
    {
      runCoralQuery: (query) => {
        receivedQueries.push(query);

        return JSON.stringify([
          {
            recordSet: "sentryIssues",
            id: "CHECKOUT-4",
            title: "TraceBullet checkout sandbox error",
            serviceTag: "checkout",
            firstSeenAt: "2026-05-27T20:52:04Z"
          },
          {
            recordSet: "pullRequests",
            number: 11,
            title: "Add second checkout Coral sandbox marker",
            author: "sivaratrisrinivas",
            serviceTag: "checkout",
            mergedAt: "2026-05-27T20:48:42Z",
            mergeCommit: "ea7c0847e29ff32cd5d6db6af1f9be36fcc704bf"
          },
          {
            recordSet: "slackMessages",
            channel: "#all-coral-tracebullet",
            author: "coral",
            sentAt: "2026-05-27T20:50:57.474059Z",
            text: "Merged PR #11 for checkout test error investigation"
          }
        ]);
      },
      env: coralSandboxEnv()
    }
  );

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);
  const investigationQuery = receivedQueries[0];

  assert.equal(machineReport.suspectedCausingPr.number, 11);
  assert.equal(machineReport.runtime.coralQueryStrategy, "Single Investigation Query");
  assert.equal(receivedQueries.length, 1);
  assert.match(investigationQuery, /WITH target_sentry_issue AS/);
  assert.match(investigationQuery, /FROM sentry\.issues/);
  assert.match(investigationQuery, /FROM github\.pulls/);
  assert.match(investigationQuery, /slack\.messages\(channel => 'C0B689JN3L6'\)/);
  assert.match(investigationQuery, /COALESCE\(pull_requests\.label_names, ''\)/);
  assert.match(investigationQuery, /CAST\(pull_requests\.merged_at AS TIMESTAMP\) BETWEEN/);
  assert.match(investigationQuery, /CAST\(slack_messages\.ts AS TIMESTAMP\) BETWEEN/);
  assert.match(investigationQuery, /INTERVAL '30 minutes'/);
  assert.match(investigationQuery, /slack_messages\.text LIKE/);
  assert.match(investigationQuery, /ORDER BY sentAt DESC/);
});

test("Coral sandbox investigation falls back to staged queries when the all-in-one query fails", async () => {
  const receivedQueries = [];

  const result = runTraceBulletCommand(
    [
      "investigate",
      "CHECKOUT-4",
      "--source",
      "coral",
      "--json"
    ],
    {
      runCoralQuery: (query) => {
        receivedQueries.push(query);

        if (receivedQueries.length === 1) {
          throw new Error("Coral rejected the all-in-one query.");
        }

        if (query.includes("FROM sentry.issues")) {
          return JSON.stringify([
            {
              recordSet: "sentryIssues",
              id: "CHECKOUT-4",
              title: "TraceBullet checkout sandbox error",
              serviceTag: "checkout",
              firstSeenAt: "2026-05-27T20:52:04Z"
            }
          ]);
        }

        if (query.includes("slack.messages")) {
          return JSON.stringify([
            {
              recordSet: "slackMessages",
              channel: "#all-coral-tracebullet",
              author: "coral",
              sentAt: "2026-05-27T20:50:57.474059Z",
              text: "Merged PR #11 for checkout test error investigation"
            }
          ]);
        }

        return JSON.stringify([
          {
            recordSet: "pullRequests",
            number: 11,
            title: "Add second checkout Coral sandbox marker",
            author: "sivaratrisrinivas",
            serviceTag: "checkout",
            mergedAt: "2026-05-27T20:48:42Z",
            mergeCommit: "ea7c0847e29ff32cd5d6db6af1f9be36fcc704bf"
          }
        ]);
      },
      env: coralSandboxEnv()
    }
  );

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.suspectedCausingPr.number, 11);
  assert.equal(machineReport.runtime.coralQueryStrategy, "Staged Query Fallback");
  assert.equal(machineReport.runtime.coralQueryFallbackReason, "Coral rejected the all-in-one query.");
  assert.equal(receivedQueries.length, 4);
  assert.match(receivedQueries[0], /UNION ALL/);
  assert.match(receivedQueries[1], /FROM sentry\.issues/);
  assert.match(receivedQueries[2], /FROM github\.pulls/);
  assert.match(receivedQueries[3], /slack\.messages/);
});

test("Coral retry classifier recognizes transient source failures only", () => {
  assert.equal(isRetryableCoralFailure("Source request timed out"), true);
  assert.equal(
    isRetryableCoralFailure(
      "source API request timed out after 30s [GET] https://sentry.io/api/0/organizations/srinivas-m7/issues/"
    ),
    true
  );
  assert.equal(
    isRetryableCoralFailure("The service is currently unavailable: PROVIDER_REQUEST_FAILED"),
    true
  );
  assert.equal(
    isRetryableCoralFailure(
      "Error: Invalid argument error: Last offset 1128613955 of Utf8 is larger than values length 10"
    ),
    false
  );
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
