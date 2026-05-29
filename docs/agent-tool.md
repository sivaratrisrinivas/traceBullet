# TraceBullet Agent Tool

TraceBullet exposes two local agent-facing surfaces that wrap the existing Investigation Command.

The Investigation Command remains the source of truth for both.

## MCP Server

Run the local MCP stdio server:

```bash
npm run mcp:server
```

The server exposes one tool:

```text
tracebullet_investigate
```

It also exposes:

- Resources for the domain context, demo readiness notes, and agent-tool documentation.
- A prompt named `tracebullet_investigation_brief` that instructs an agent to use TraceBullet without overclaiming root cause.
- Structured tool output under `structuredContent.report`, so MCP clients can read the Machine Report without parsing display text.

Tool arguments:

```json
{
  "sentryIssueId": "CHECKOUT-4",
  "source": "coral",
  "includeEnrichment": true,
  "includeNarrative": true,
  "outputFormat": "json"
}
```

`source` can be `local` or `coral`. `outputFormat` can be `json` or `text`.

`includeEnrichment` attaches optional Datadog/PagerDuty Operational Enrichment. If live enrichment is not enabled or fails, the report labels fallback data as Demo Enrichment Data.

`includeNarrative` calls the local Ollama model when available and falls back to a Deterministic Narrative.

## JSON Stdin/Stdout Adapter

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
  "source": "coral",
  "includeEnrichment": true,
  "includeNarrative": true
}
```

`source` can be `local` or `coral`. It defaults to `local`.
`includeEnrichment` and `includeNarrative` default to `false`.

## Output

The output is the same Machine Report produced by:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json
```

## Boundaries

- The MCP server is a local stdio server, not a hosted service.
- The MCP server exposes resources and prompts, but the investigation tool still delegates to the Investigation Command.
- The JSON stdin/stdout adapter is still available for simple agent use.
- Narrative Summary output is formatting only, not Evidence.
- Operational Enrichment is optional context, not matching proof.

The Investigation Command remains the source of truth.
