# TraceBullet UI

A local React viewer for TraceBullet Machine Reports.

## Run

```bash
npm run ui:dev
```

Then open:

```text
http://localhost:4175
```

Build the static UI:

```bash
npm run ui:build
```

## Data

The UI ships with the `CHECKOUT-4` reference Machine Report and can import fresh JSON from:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json --enrich --narrative
```

The import panel accepts raw Machine Report JSON and can also recover the JSON object from pasted command output that includes a small preamble.

The UI is a viewer. The Investigation Command and Machine Report remain the source of truth.
