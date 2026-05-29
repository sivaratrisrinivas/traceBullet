# TraceBullet Demo Readiness

TraceBullet is ready to demo as a local, deterministic incident investigation slice.

## Demo Objective

Show that a developer can start from one Sentry Issue ID and use Coral-backed live sandbox sources to identify the Suspected Causing PR and supporting Slack Context without stuffing raw API responses into an LLM.

## Demo Command

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json --enrich --narrative
```

Expected result:

- Sentry issue: `CHECKOUT-4`
- Service Tag: `checkout`
- Suspected Causing PR: `#11`
- Merge commit: `ea7c0847e29ff32cd5d6db6af1f9be36fcc704bf`
- Slack Context: `Merged PR #11 for checkout test error investigation`
- Runtime source: `Coral Sandbox Sources`
- Operational Enrichment mode: `Live Coral Enrichment` or `Demo Enrichment Data`
- Narrative mode: `Local LLM Narrative` or `Deterministic Narrative`

## What Is Live

- The CLI runs locally.
- The MCP Investigation Tool runs locally over stdio.
- The JSON stdin/stdout adapter runs locally.
- The React UI runs locally.
- Coral queries live sandbox Sentry, GitHub, and Slack sources.
- The report is generated from live Coral query results.
- The output exposes the Coral SQL query representation.
- The output exposes whether the live run used the Single Investigation Query or Staged Query Fallback.
- Runtime duration is measured for the current execution.
- Retryable upstream source timeouts are retried before fallback or failure.
- Optional Datadog/PagerDuty Operational Enrichment can query Coral when live enrichment query templates are configured.
- Optional Local LLM Narrative can use Ollama with `qwen3:0.6b` when configured.

## What Is Synthetic

- The Sentry issue is a sandbox issue created for the demo.
- The GitHub pull request is in the sandbox repository.
- The Slack message is in a sandbox Slack channel.
- Demo Enrichment Data is synthetic when optional Datadog/PagerDuty live sources are not configured.
- Deterministic Narrative is template-generated when local Ollama is not running.
- No private company incident data is used.

## How Coral Is Used

TraceBullet uses Coral to query:

- `sentry.issues`
- `github.pulls`
- `slack.channels`
- `slack.messages(channel => '<channel-id>')`
- `slack.users`

For the live path, TraceBullet tries one Coral investigation query first. That query performs the important source-side narrowing:

- Find the target Sentry issue.
- Return GitHub pull requests with the same Service Tag.
- Return only pull requests merged inside the 30-minute Investigation Window.
- Return only pre-incident Slack messages that include the Service Tag, PR number, or merge commit marker.

TypeScript then normalizes the rows, ranks candidate pull requests defensively, and formats the Deterministic Report and Machine Report.

Optional Live Coral Enrichment can add Datadog and PagerDuty context after the Suspected Causing PR is selected. Operational Enrichment is intentionally separate from the required Evidence. Live enrichment requires explicit query templates in `TRACEBULLET_DATADOG_ENRICHMENT_QUERY` or `TRACEBULLET_PAGERDUTY_ENRICHMENT_QUERY`; otherwise fallback context is labeled Demo Enrichment Data.

## Why TypeScript Still Ranks

The current implementation keeps the demo reliable while still proving the Coral value: live local querying across Sentry, GitHub, and Slack with source-side candidate filtering. If the larger Coral investigation query fails, TraceBullet falls back to staged Coral queries with the same filtering rules.

The honest demo claim is:

> TraceBullet uses Coral to query live Sentry, GitHub, and Slack sandbox sources locally, filters Candidate PRs and Slack Context through SQL, then applies deterministic TypeScript ranking and report formatting.

Do not claim:

> Coral alone chooses the final Suspected Causing PR.

Also do not claim:

> Demo Enrichment Data came from Datadog or PagerDuty live APIs.

## Hackathon Fit

TraceBullet satisfies the core TraceBullet objective from the blueprint:

- Local terminal interface accepts a Sentry Issue ID.
- Live Coral sources replace fragile API-wrapper glue code.
- The investigation joins the operational problem space across Sentry, GitHub, and Slack.
- Matching is deterministic before any LLM narrative.
- The SQL/query representation is visible for trust.
- The local MCP server exposes the same Investigation Command to agent clients.
- The React UI renders the Machine Report without creating a separate source of truth.
- The suggested revert command is copyable but not executed.

## Remaining Gaps

These are not required for the current demo, but they are useful to acknowledge:

- No automatic rollback.
- No generated postmortem.
- Optional Datadog/PagerDuty live sources require local Coral source configuration.

## Demo Script

1. Start with the pain:
   "An SRE gets a Sentry issue and has to manually search GitHub and Slack to find what changed."
2. Run the command:
   `node src/cli.ts investigate CHECKOUT-4 --source coral --json --enrich --narrative`
3. Point to the result:
   "TraceBullet found PR #11, merged about 3.37 minutes before the issue first appeared."
4. Point to Slack Context:
   "It also found the pre-incident Slack marker for that PR."
5. Point to the trust layer:
   "The report includes the SQL query representation and runtime, so the result is auditable."
6. Point to optional layers:
   "The MCP tool, React UI, Operational Enrichment, and Narrative Summary all wrap the same Machine Report."
7. Close with the architecture:
   "Coral handles live local source querying and candidate filtering; TraceBullet applies deterministic ranking and report formatting."
