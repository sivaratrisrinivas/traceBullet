# TraceBullet Agent Tool

TraceBullet exposes a thin agent-facing tool that wraps the existing Investigation Command.

The tool accepts JSON on stdin and returns the Machine Report JSON on stdout.

## Run Local Prototype Data

```bash
echo '{"sentryIssueId":"SENTRY-TB-1001","source":"local"}' | npm run agent:tool
```

## Run Live Coral Sandbox Sources

```bash
echo '{"sentryIssueId":"CHECKOUT-4","source":"coral"}' | npm run agent:tool
```

## Input

```json
{
  "sentryIssueId": "CHECKOUT-4",
  "source": "coral"
}
```

`source` can be `local` or `coral`. It defaults to `local`.

## Output

The output is the same Machine Report produced by:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json
```

## Boundary

This is not a full custom MCP server. It is a small adapter surface that lets an agent call TraceBullet as a deterministic local tool.

The Investigation Command remains the source of truth.
