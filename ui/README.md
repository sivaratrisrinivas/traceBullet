# TraceBullet UI

A local React app for running TraceBullet investigations and viewing Machine Reports.

## Run Full Local App

Build the UI and start the local app server:

```bash
npm run app
```

Then open:

```text
http://127.0.0.1:4180
```

The app server exposes:

- `GET /api/health`
- `POST /api/investigate`

`POST /api/investigate` delegates to the same Investigation Command used by the CLI and MCP server. The UI requests Operational Enrichment and Narrative Summary by default.

## Run Vite UI Only

```bash
npm run ui:dev
```

Then open:

```text
http://localhost:4175
```

This mode serves the UI shell only. Use the full local app server when you want the investigation screen to call TraceBullet directly.

Build the static UI without serving it:

```bash
npm run ui:build
```

## Data

The UI calls the local API and renders the returned Machine Report as a focused step-by-step investigation flow. To inspect raw JSON outside the UI, use:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json --enrich --narrative
```

The UI is a wrapper around the Investigation Command. The Investigation Command and Machine Report remain the source of truth.
