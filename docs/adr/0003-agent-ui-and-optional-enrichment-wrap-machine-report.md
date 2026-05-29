# Agent UI and optional enrichment wrap Machine Report

TraceBullet will keep the Investigation Command and Machine Report as the source of truth while adding richer demo surfaces.

The local MCP server exposes one investigation tool that delegates to the Investigation Command and returns structured Machine Report output. The TraceBullet App Server lets the React UI request fresh reports while delegating to the same Investigation Command. The React UI renders Machine Report JSON and can still import pasted reports. The Local LLM Narrative summarizes Machine Report facts only and falls back to a Deterministic Narrative. Datadog and PagerDuty are modeled as optional Operational Enrichment; when live Coral enrichment is unavailable, fallback rows are labeled Demo Enrichment Data.

This keeps the hackathon demo aligned with agent and UI expectations without creating a second investigation engine or letting optional sources decide the Suspected Causing PR.

The trade-off is that optional layers may show fallback context when Datadog, PagerDuty, or Ollama are unavailable. That is acceptable because the report labels each mode explicitly, and the required Evidence still comes from the core Sentry, GitHub, and Slack investigation.
