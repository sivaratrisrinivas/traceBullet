# TraceBullet

TraceBullet is a local incident investigation tool that starts from a Sentry Issue ID and produces a deterministic report pointing to the most likely Suspected Causing PR.

## What

The first implemented slice is a CLI Investigation Command backed by Local Prototype Data:

```bash
node src/cli.ts investigate SENTRY-TB-1001
```

Automation and future UI surfaces can request the same investigation facts as JSON:

```bash
node src/cli.ts investigate SENTRY-TB-1001 --json
```

For the known prototype Sentry issue, TraceBullet:

- Loads local Sentry, GitHub PR, and Slack records.
- Finds Candidate PRs with an exact Service Tag match.
- Filters PRs to the 30-minute Investigation Window before the Sentry issue first appeared.
- Selects the closest prior merge as the Suspected Causing PR.
- Lists other Candidate PRs separately from the Suspected Causing PR.
- Shows missing Slack Context as an evidence gap without failing the investigation.
- Returns No Suspected Causing PR Found when Service Match, Time Match, or both are missing.
- Prints a human-readable Deterministic Report with Sentry issue, Suspected Causing PR, Evidence, Other Candidate PRs, Suggested Revert Command, Query Representation, and Runtime sections.
- Prints a Machine Report JSON shape with the same core facts when `--json` is passed.

## Why

TraceBullet avoids guessing. The MVP uses deterministic matching rules instead of an LLM as the source of truth:

- A Service Match requires the same Service Tag on the Sentry issue and pull request.
- A Time Match requires the pull request to be merged before first seen and inside the 30-minute Investigation Window.
- Slack Context can strengthen Evidence, but it is not required to identify a Suspected Causing PR.
- Slack Context only counts when a Slack Marker appears before the Sentry issue first appears.
- Suggested Revert Command is a copyable next step only. TraceBullet prints the command but does not run rollback commands or mutate the repository.
- Query Representation records the Investigation Query Template behavior used for Local Prototype Data so later Coral wiring can replace it with the Live Coral Query text.
- Runtime records elapsed command time in milliseconds without making tests depend on exact wall-clock timing.

This keeps the first product surface small, testable, and ready to swap from Local Prototype Data to sandbox Coral sources later.

## How

Requirements:

- Node.js 24 or newer.

Run the successful local investigation:

```bash
node src/cli.ts investigate SENTRY-TB-1001
```

Run the machine-readable investigation:

```bash
node src/cli.ts investigate SENTRY-TB-1001 --json
```

Run an investigation where Slack Context is missing:

```bash
node src/cli.ts investigate SENTRY-TB-1002
```

Run investigations where required proof is missing:

```bash
node src/cli.ts investigate SENTRY-TB-1003
node src/cli.ts investigate SENTRY-TB-1004
node src/cli.ts investigate SENTRY-TB-1005
```

These no-suspect fixtures cover the three missing-proof outcomes:

- `SENTRY-TB-1003`: Time Match is present, Service Match is missing.
- `SENTRY-TB-1004`: Service Match is present, Time Match is missing.
- `SENTRY-TB-1005`: both Service Match and Time Match are missing.

Run an investigation where a Suspected Causing PR is found but commit information is missing:

```bash
node src/cli.ts investigate SENTRY-TB-1006
```

TraceBullet marks the Suggested Revert Command unavailable when there is no merge commit.

Run tests:

```bash
npm test
```

The tests exercise the public command behavior and verify successful, no-suspect, unavailable Suggested Revert Command, Query Representation, and Runtime reports without asserting private implementation details or exact wall-clock timing.
