# TraceBullet Privacy Note

TraceBullet is designed for a local demo workflow. The CLI runs on the developer's machine and does not send investigation data to an external LLM, vector database, or hosted TraceBullet service.

## What Leaves The Machine

When `--source coral` is used, Coral queries the configured sandbox source APIs:

- Sentry
- GitHub
- Slack

Those API calls are necessary to read live sandbox records. TraceBullet should stay scoped to sandbox accounts, repositories, projects, and channels.

## What Stays Local

- The TraceBullet CLI process.
- The deterministic matching and report formatting.
- The Coral SQL/query representation.
- Environment variables used by the local process.
- JSON and human-readable reports unless the user exports or shares them.
- Retry settings for transient Coral source failures.
- Local LLM Narrative requests when Ollama is running on `localhost`.
- TraceBullet App Server requests and responses on the local host.
- Demo Enrichment Data when optional Datadog/PagerDuty live sources are not configured.

## Token Handling

TraceBullet does not require tokens to be committed to the repository.

Use environment variables or Coral's local configuration for credentials. The optional Slack marker helper reads `SLACK_BOT_TOKEN` from the current environment and should only be used with a sandbox Slack app.

Optional Ollama settings use `TRACEBULLET_OLLAMA_URL` and `TRACEBULLET_OLLAMA_MODEL`. Keep `TRACEBULLET_OLLAMA_URL` pointed at a local Ollama server for the Local LLM Narrative path.

## Demo Safety Rules

- Use sandbox Sentry, GitHub, and Slack sources only.
- Do not connect private company incident data for the demo.
- Do not paste tokens into docs, issues, screenshots, or recordings.
- Rotate any token that is accidentally exposed.
- Treat Slack Context as supporting evidence, not proof by itself.
- Label Operational Enrichment mode honestly in screenshots and recordings.
- Do not describe Demo Enrichment Data as live Datadog or PagerDuty API data.

## Honest Claim

The accurate privacy claim is:

> TraceBullet runs locally and uses Coral to query configured sandbox source APIs. It does not upload investigation data to a hosted TraceBullet backend or external LLM.

Do not claim:

> No data ever leaves the machine.

Live source API calls necessarily leave the machine.
