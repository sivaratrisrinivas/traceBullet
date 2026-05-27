# TraceBullet

TraceBullet is a local command-line tool for answering one question:

> Which recently merged pull request most likely caused this Sentry error?

It starts with a Sentry issue ID, checks matching GitHub pull requests, and adds nearby Slack context when a relevant message exists.

## Quick Start

Requirements:

- Node.js 24 or newer
- Coral configured if you want to query live sandbox data

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

The live code intentionally runs small per-source queries and combines the results in TypeScript. This avoids Coral CLI JSON/Arrow encoding failures seen with a larger cross-source `UNION ALL` query.

The live path reads these Coral schemas:

- `sentry.issues`
- `github.pulls`
- `slack.channels`
- `slack.messages(channel => '<channel-id>')`
- `slack.users`

If Coral returns `not_in_channel`, invite the Coral Slack app into the configured Slack channel and rerun the command.

## Output

Human-readable output includes:

- Sentry issue
- Suspected pull request, when one is found
- Matching evidence
- Slack context, when present
- Other matching pull requests
- Missing proof, when no pull request is selected
- Suggested `git revert` command, when a merge commit is available

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
