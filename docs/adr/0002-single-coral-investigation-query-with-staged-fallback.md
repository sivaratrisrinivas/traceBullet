# Single Coral investigation query with staged fallback

TraceBullet will try one Coral investigation query first for the live sandbox path. That query returns the target Sentry issue, Candidate PRs, and Slack Context rows as one normalized result set.

If the larger query fails, TraceBullet falls back to staged Coral queries that use the same source-side filtering rules.

This keeps the demo aligned with Coral's cross-source SQL value while preserving reliability for live Sentry, GitHub, and Slack source calls. TypeScript still owns defensive ranking and report formatting.

The trade-off is that the fallback path is less pure than a single-query-only implementation, but it avoids making the demo brittle when Coral or an upstream source rejects a larger query shape.
