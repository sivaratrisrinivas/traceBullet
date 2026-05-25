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
- Prints a human-readable Deterministic Report with Sentry issue, Suspected Causing PR, Evidence, and Runtime sections.
- Prints a Machine Report JSON shape with the same core facts when `--json` is passed.

## Why

TraceBullet avoids guessing. The MVP uses deterministic matching rules instead of an LLM as the source of truth:

- A Service Match requires the same Service Tag on the Sentry issue and pull request.
- A Time Match requires the pull request to be merged before first seen and inside the 30-minute Investigation Window.
- Slack Context can strengthen Evidence, but it is not required to identify a Suspected Causing PR.

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

Run tests:

```bash
npm test
```

The tests exercise the public command behavior and verify the successful investigation report without asserting private implementation details.
