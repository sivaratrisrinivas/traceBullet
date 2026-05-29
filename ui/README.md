# TraceBullet UI

A local React app for running TraceBullet investigations and viewing Machine Reports.

## Run Full Local App

Build the UI and start the local app server:

```bash
npm run ui:build
npm run app:server
```

Then open:

```text
http://127.0.0.1:4180
```

The app server exposes:

- `GET /api/health`
- `POST /api/investigate`

`POST /api/investigate` delegates to the same Investigation Command used by the CLI and MCP server. It requests Operational Enrichment and Narrative Summary by default unless the request turns them off.

## Run Vite UI Only

```bash
npm run ui:dev
```

Then open:

```text
http://localhost:4175
```

This mode serves the UI shell only. Use the full local app server when you want the Investigate screen to call TraceBullet directly.

Build the static UI without serving it:

```bash
npm run ui:build
```

## Data

The UI ships with the `CHECKOUT-4` reference Machine Report, can call the local API, and can still import fresh JSON from:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json --enrich --narrative
```

The import panel accepts raw Machine Report JSON and can also recover the JSON object from pasted command output that includes a small preamble.

The UI is a wrapper around the Investigation Command. The Investigation Command and Machine Report remain the source of truth.
