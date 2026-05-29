# TraceBullet Judging Map

This map explains how the current TraceBullet demo fits the hackathon judging criteria.

## Best Use Of Coral

Claim: TraceBullet uses Coral for live, local querying across Sentry, GitHub, and Slack.

Evidence:

- Live command: `node src/cli.ts investigate CHECKOUT-4 --source coral --json`
- Coral schemas used: `sentry.issues`, `github.pulls`, `slack.channels`, `slack.messages`, `slack.users`
- TraceBullet tries one Coral investigation query first.
- A staged Coral query fallback preserves demo reliability if the larger query shape fails.
- Coral-side filtering narrows Candidate PRs by Service Tag and the 30-minute Investigation Window.
- Coral-side filtering narrows Slack Context to pre-incident messages with a Service Tag, PR number, or merge commit marker.
- The Machine Report exposes the Coral SQL query representation.
- The Machine Report exposes the live Coral query strategy.
- Retryable upstream source timeouts are retried for demo resilience.
- Optional Datadog/PagerDuty Operational Enrichment can be queried through Coral when explicit enrichment query templates are configured.

Honest boundary:

- TypeScript still performs defensive ranking and report formatting.
- Do not claim Coral alone chooses the final Suspected Causing PR.
- Do not claim Demo Enrichment Data came from live Datadog or PagerDuty APIs.

## Technical Implementation

Claim: TraceBullet is a focused, tested Node.js/TypeScript CLI with deterministic behavior.

Evidence:

- CLI entrypoint: `src/cli.ts`
- Agent-facing tool: `scripts/tracebullet-agent-tool.mjs`
- MCP server: `scripts/tracebullet-mcp-server.mjs`
- Local app server: `scripts/tracebullet-app-server.mjs`
- Core matching and formatting: `src/investigation.ts`
- Live Coral data path: `src/coralSandboxData.ts`
- Optional enrichment: `src/operationalEnrichment.ts`
- Optional narrative: `src/narrative.ts`
- Local sample data: `src/localPrototypeData.ts`
- Regression tests: `test/investigate-cli.test.js`

Verified behavior:

- Known local issue returns a Suspected Causing PR.
- JSON Machine Report is supported.
- Coral sandbox source is supported.
- Missing Slack Context does not fail a valid suspect.
- No-match cases return No Suspected Causing PR Found.
- Suggested Revert Command is unavailable when merge commit data is missing.

## Potential Impact

Claim: TraceBullet targets a painful incident-response workflow.

Why it matters:

- On-call engineers often manually jump between Sentry, GitHub, and Slack.
- TraceBullet compresses that work into one Investigation Command.
- The output gives the responder a Suspected Causing PR, supporting Evidence, Slack Context, and a safe revert suggestion.

Current scope:

- The demo uses sandbox data.
- It is not production hardening.
- It is designed to prove the investigation loop, not replace an incident-management platform.

## Creativity And Originality

Claim: TraceBullet applies Coral to an SRE forensic workflow instead of building a generic chatbot or dashboard.

Evidence:

- The workflow starts from a Sentry Issue ID.
- It connects error telemetry, code changes, and team communication.
- It uses deterministic matching rules before any optional narrative layer.
- It avoids semantic guessing as the source of truth.

## Aesthetics And UX

Claim: The current UX is CLI-first, with a future visual direction already chosen.

Evidence:

- Human-readable Deterministic Report.
- JSON Machine Report for future UI rendering.
- JSON stdin/stdout agent adapter.
- Local MCP Investigation Tool.
- Local TraceBullet App Server.
- React investigation UI: `ui/index.html`
- Suggested Revert Command is copyable but not executed.
- Accepted prototype direction: `prototypes/tracebullet-app-prototype/NOTES.md`

Known boundary:

- The UI renders Machine Report JSON; it does not run a separate investigation engine.
- The app server delegates to the Investigation Command; it does not run a separate investigation engine.
- Narrative Summary output is optional formatting, not Evidence.

## Learning And Growth

Claim: The project shows a clear learning path from prototype data to live Coral sandbox sources.

Evidence:

- Local Prototype Data exists for repeatable tests.
- Coral Sandbox Sources exist for live demo data.
- README documents the setup and live sandbox records.
- ADR documents the CLI-first deterministic decision.
- Demo readiness docs explain what is live, what is synthetic, and what not to overclaim.

## Strongest Demo Claim

Use this wording:

> TraceBullet uses Coral to query live Sentry, GitHub, and Slack sandbox sources locally, filters Candidate PRs and Slack Context through SQL, then applies deterministic TypeScript ranking and report formatting.

Avoid this wording:

> Coral alone determines the final root cause.

TraceBullet returns a Suspected Causing PR, not a guaranteed root cause.
