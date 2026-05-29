# TraceBullet

TraceBullet is a local command-line tool for answering one question:

> Which recently merged pull request most likely caused this Sentry error?

It starts with a Sentry issue ID, checks matching GitHub pull requests, and adds nearby Slack context when a relevant message exists.

## Quick Start

Requirements:

- Node.js 24 or newer
- Coral configured if you want to query live sandbox data
- Ollama with `qwen3:0.6b` if you want Local LLM Narrative output

Run the local sample data:

```bash
node src/cli.ts investigate SENTRY-TB-1001
```

Get JSON output:

```bash
node src/cli.ts investigate SENTRY-TB-1001 --json
```

Run the current live sandbox investigation:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral
node src/cli.ts investigate CHECKOUT-4 --source coral --json
```

Run tests:

```bash
npm test
```

Run with optional Operational Enrichment and Narrative Summary:

```bash
node src/cli.ts investigate SENTRY-TB-1001 --json --enrich --narrative
```

Run the MCP Investigation Tool:

```bash
npm run mcp:server
```

Run the JSON stdin/stdout adapter:

```bash
echo '{"sentryIssueId":"SENTRY-TB-1001","source":"local"}' | npm run agent:tool
```

Open the React UI:

```bash
npm run ui:dev
```

Run the full local app after building the UI:

```bash
npm run ui:build
npm run app:server
```

## Demo In 60 Seconds

Run the verified live Coral investigation:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json --enrich --narrative
```

Expected result:

- Suspected Causing PR: `#11`
- Service Match: `checkout`
- Time Match: about `3.37` minutes before first seen
- Slack Context: `Merged PR #11 for checkout test error investigation`
- Coral query strategy: `Single Investigation Query`
- Optional Operational Enrichment: `Live Coral Enrichment` or labeled `Demo Enrichment Data`
- Optional Narrative Summary: `Local LLM Narrative` or `Deterministic Narrative`

Run the same investigation through the agent-facing adapter:

```bash
echo '{"sentryIssueId":"CHECKOUT-4","source":"coral"}' | npm run agent:tool
```

Start the MCP server for agent clients:

```bash
npm run mcp:server
```

Open the full local React app:

```bash
npm run ui:build
npm run app:server
```

Then open:

```text
http://127.0.0.1:4180
```

TraceBullet's honest claim:

> TraceBullet uses Coral to query live Sentry, GitHub, and Slack sandbox sources locally, filters Candidate PRs and Slack Context through SQL, then applies deterministic TypeScript ranking and report formatting.

Optional Datadog/PagerDuty context is Operational Enrichment, not required Evidence. Optional Local LLM Narrative summarizes the Machine Report and is not the source of truth.

## How It Decides

TraceBullet uses fixed rules. It does not ask an LLM to guess.

A pull request is treated as the likely cause only when both are true:

- The Sentry project and pull request label use the same service name, such as `checkout`.
- The pull request was merged during the 30 minutes before the Sentry issue first appeared.

If more than one pull request matches, TraceBullet picks the one merged closest to the Sentry issue time.

Slack is extra context. A Slack message can support the report, but a missing Slack message does not stop TraceBullet from finding a matching pull request.

## Local Sample Cases

These examples use built-in fake data:

```bash
node src/cli.ts investigate SENTRY-TB-1001
node src/cli.ts investigate SENTRY-TB-1001 --json
```

Other local examples:

- `SENTRY-TB-1002`: finds a pull request, but Slack context is missing.
- `SENTRY-TB-1003`: has a timing match, but no service match.
- `SENTRY-TB-1004`: has a service match, but no timing match.
- `SENTRY-TB-1005`: has neither required match.
- `SENTRY-TB-1006`: finds a pull request, but cannot print a revert command because the merge commit is missing.

## Live Sandbox Setup

The live path uses Coral to read real sandbox data from:

- Sentry issues
- GitHub pull requests
- Slack channel messages

Keep this pointed at sandbox data only. Do not connect it to private company or production workspaces.

Before running a live check:

1. Configure Coral for the sandbox GitHub, Sentry, and Slack sources.
2. Make sure the Sentry issue is in the sandbox Sentry project.
3. Label the matching GitHub pull request with the Sentry project name, for example `checkout`.
4. Invite the Coral Slack app into the sandbox Slack channel.

TraceBullet defaults to this sandbox:

- GitHub owner: `sivaratrisrinivas`
- GitHub repo: `traceBullet`
- Slack channel ID: `C0B689JN3L6`
- Coral runner: `scripts/run-coral-sql.mjs`

Override those defaults with:

- `TRACEBULLET_GITHUB_OWNER`
- `TRACEBULLET_GITHUB_REPO`
- `TRACEBULLET_SLACK_CHANNEL_ID`
- `TRACEBULLET_CORAL_QUERY_COMMAND`
- `TRACEBULLET_CORAL_QUERY_ARGS`
- `TRACEBULLET_CORAL_QUERY_RETRIES`
- `TRACEBULLET_CORAL_RETRY_DELAY_MS`
- `TRACEBULLET_ENABLE_LIVE_ENRICHMENTS`
- `TRACEBULLET_DATADOG_ENRICHMENT_QUERY`
- `TRACEBULLET_PAGERDUTY_ENRICHMENT_QUERY`
- `TRACEBULLET_OLLAMA_URL`
- `TRACEBULLET_OLLAMA_MODEL`
- `TRACEBULLET_NARRATIVE_MODE`

See [.env.example](.env.example) for the sandbox environment shape.

Live Datadog/PagerDuty enrichment is opt-in. Set `TRACEBULLET_ENABLE_LIVE_ENRICHMENTS=true` and provide one or both enrichment query templates. Templates receive `{{SERVICE_TAG}}`, `{{SENTRY_ISSUE_ID}}`, `{{FIRST_SEEN_AT}}`, `{{PR_NUMBER}}`, and `{{MERGE_COMMIT}}` placeholders and must return normalized rows matching the Machine Report enrichment fields. Without templates, TraceBullet labels fallback context as Demo Enrichment Data.

## Current Live Sandbox

The current complete live example is:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json
```

Expected result:

- Sentry issue: `CHECKOUT-4`
- Matching pull request: PR #11
- Service: `checkout`
- PR merged about 3.37 minutes before the Sentry issue first appeared
- Slack context is included

Current live records:

- `CHECKOUT-1`: old Sentry issue. No pull request is selected because PR #10 merged after this issue appeared.
- `CHECKOUT-2`: finds PR #10, but has no Slack context because the Slack message was posted later.
- `CHECKOUT-3`: old Sentry issue. No pull request is selected because PR #10 was outside the 30-minute window.
- `CHECKOUT-4`: current full example. Finds PR #11 and includes Slack context.
- PR #10: `Add checkout Coral sandbox marker`, merge commit `364c934791ec401deb3cab188d68c46622ffe0a5`.
- PR #11: `Add second checkout Coral sandbox marker`, merge commit `ea7c0847e29ff32cd5d6db6af1f9be36fcc704bf`.

The Slack message used by `CHECKOUT-4` is:

```text
Merged PR #11 for checkout test error investigation
```

For the demo narrative and live-vs-synthetic boundary, see [docs/demo-readiness.md](docs/demo-readiness.md).

For the hackathon criteria mapping, see [docs/judging-map.md](docs/judging-map.md).

For local execution and token-handling boundaries, see [docs/privacy.md](docs/privacy.md).

For the MCP server and JSON stdin/stdout agent adapter, see [docs/agent-tool.md](docs/agent-tool.md).

For the React investigation interface and local app server, see [ui/README.md](ui/README.md).

## Posting A Slack Marker

TraceBullet can read Slack through Coral, but Coral does not post Slack messages. This repo includes a small helper for posting a marker through Slack's API:

```bash
SLACK_BOT_TOKEN=xoxb-... node scripts/post-slack-marker.mjs "Merged PR #11 for checkout test error investigation"
```

The Slack token must have `chat:write`, and the app must be allowed to post in channel `C0B689JN3L6`.

If Slack returns `missing_scope`:

1. Open the Slack app settings.
2. Go to `OAuth & Permissions`.
3. Add the Bot Token OAuth Scope `chat:write`.
4. Reinstall the app to the workspace.
5. Use the new bot token.

Timing matters: the Slack message must be posted before the Sentry issue first appears. If you post the message after the issue, trigger a fresh Sentry error and investigate the new Sentry short ID.

## Coral Runner

The included runner reads SQL from stdin and passes it to Coral:

```bash
scripts/run-coral-sql.mjs
```

It runs:

```bash
coral sql --format json <SQL>
```

The live code tries one Coral investigation query first. That query returns the target Sentry issue, Candidate PR rows, and Slack Context rows in one normalized result set. If Coral rejects the larger query shape, TraceBullet falls back to smaller staged Coral queries with the same source-side narrowing:

- Sentry is queried for the target issue.
- GitHub is queried for pull requests with the same Service Tag merged inside the 30-minute Investigation Window.
- Slack is queried for pre-incident messages with the Service Tag, PR number, or merge commit marker.

This keeps Coral responsible for live source retrieval and candidate filtering while TypeScript handles defensive ranking, report formatting, and local prototype parity. The staged fallback avoids Coral CLI JSON/Arrow encoding failures seen with larger cross-source `UNION ALL` query shapes.

The live path reads these Coral schemas:

- `sentry.issues`
- `github.pulls`
- `slack.channels`
- `slack.messages(channel => '<channel-id>')`
- `slack.users`

If Coral returns `not_in_channel`, invite the Coral Slack app into the configured Slack channel and rerun the command.

If Coral reports a retryable upstream source timeout, such as a Sentry API timeout, TraceBullet retries the Coral query once by default before falling back or failing. Tune this with `TRACEBULLET_CORAL_QUERY_RETRIES` and `TRACEBULLET_CORAL_RETRY_DELAY_MS`.

## Output

Human-readable output includes:

- Sentry issue
- Suspected pull request, when one is found
- Matching evidence
- Slack context, when present
- Other matching pull requests
- Missing proof, when no pull request is selected
- Suggested `git revert` command, when a merge commit is available
- Coral query strategy, for live sandbox runs

JSON output includes the same facts for tests and future UI work:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json
```

## Accepted Prototype Direction

The Accepted prototype direction is saved in `prototypes/tracebullet-app-prototype/NOTES.md`. The dashboard is not part of the first implementation.

Later dashboard work should keep the one-action-per-screen instrument style from the prototype:

- Sentry Issue ID: choose the issue to investigate.
- Suspected Causing PR: read the selected pull request.
- Evidence: check why the pull request was selected.
- Suggested Revert Command: copy the command when a merge commit is available.
- Machine Report: inspect the JSON output.
