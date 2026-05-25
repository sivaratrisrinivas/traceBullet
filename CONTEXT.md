# TraceBullet

TraceBullet is a local incident investigation tool for tracing a production failure back to the code change and team conversation that likely caused it.

## Language

**TraceBullet**:
A local incident investigation tool that connects an observed production failure to the code change and communication context that likely caused it.
_Avoid_: TrustSync, ScopeGuard, generic hackathon app

**Sentry Issue ID**:
The identifier the user gives TraceBullet to start an investigation.
_Avoid_: Error ID, alert ID, pasted stack trace, PagerDuty incident ID

**Suspected Causing PR**:
The pull request TraceBullet identifies as the most likely source of a production failure.
_Avoid_: Root cause, guilty PR, broken PR

**Candidate PR**:
A pull request with both a Service Match and a Time Match for the current investigation.
_Avoid_: Random PR, related PR

**No Suspected Causing PR Found**:
The investigation outcome when no pull request satisfies the required Service Match and Time Match.
_Avoid_: Failed investigation, unknown root cause

**Evidence**:
The records that support a Suspected Causing PR, including author, merge time, related commit, and matching Slack message.
_Avoid_: Guess, explanation, vibe

**Service Match**:
A link showing that the Suspected Causing PR changed the same application service where the Sentry issue appeared.
_Avoid_: General code relevance, repository match

**Service Tag**:
A shared service name recorded on both the Sentry issue and the GitHub pull request, such as `checkout`.
_Avoid_: Smart service detection, inferred ownership

**Time Match**:
A link showing that the Suspected Causing PR was merged shortly before the Sentry issue first appeared.
_Avoid_: Recent activity, rough timing

**Investigation Window**:
The 30-minute period before a Sentry issue first appears, used to find candidate pull requests.
_Avoid_: Recent window, deployment window

**Slack Context**:
A related Slack message near the failure time that explains discussion, risk, or intent around the Suspected Causing PR or affected service.
_Avoid_: Required proof, chat summary

**Slack Marker**:
An explicit PR number, Service Tag, or commit hash inside a Slack message that links it to a Candidate PR.
_Avoid_: Semantic similarity, vague chat relevance

**Synthetic Incident Data**:
Fake GitHub, Sentry, and Slack records created in sandbox accounts for a safe, repeatable demo.
_Avoid_: Fake SQL execution, production data

**Sentry Issue Generator**:
A minimal script or direct action that creates the demo Sentry issue without building a full production app.
_Avoid_: Demo ecommerce app, real outage simulator

**Sandbox Source**:
A real external tool account, repository, project, workspace, or channel used only for TraceBullet demo data.
_Avoid_: Production source, private company data

**Live Coral Query**:
The real SQL query TraceBullet runs through Coral during an investigation.
_Avoid_: Precomputed result, LLM-only matching

**Local Prototype Data**:
Small sample files used to build and test TraceBullet before live Coral sources are configured.
_Avoid_: Final demo data, fake Coral output

**Investigation Query Template**:
The fixed SQL pattern TraceBullet uses to find Candidate PRs for a Sentry Issue ID.
_Avoid_: AI-generated SQL, ad hoc query

**Investigation Command**:
The terminal command that starts a TraceBullet investigation from a Sentry Issue ID.
_Avoid_: Primary dashboard flow, alert deep link

**Deterministic Report**:
A fixed-format investigation output generated directly from Coral query results.
_Avoid_: AI-written conclusion, narrative guess

**Machine Report**:
A JSON representation of the Deterministic Report for tests, debugging, and later UI rendering.
_Avoid_: Separate result model, hidden output

**Narrative Summary**:
An optional human-readable explanation generated from the Deterministic Report.
_Avoid_: Source of truth, primary evidence

**Suggested Revert Command**:
A copyable `git revert` command shown as a possible remediation step without being executed by TraceBullet.
_Avoid_: Automatic rollback, one-click revert

**Report Section**:
A named part of the Deterministic Report, such as Sentry issue, Suspected Causing PR, Evidence, other candidates, missing proof, SQL, or runtime.
_Avoid_: Chat response, loose paragraph

## Relationships

- **TraceBullet** investigates one observed production failure at a time.
- A **Sentry Issue ID** starts exactly one **TraceBullet** investigation.
- A **TraceBullet** investigation returns one **Suspected Causing PR**.
- A **TraceBullet** investigation can return **No Suspected Causing PR Found** when no **Candidate PR** exists.
- A **Suspected Causing PR** is supported by one or more pieces of **Evidence**.
- A **Candidate PR** is eligible to become the **Suspected Causing PR**.
- When multiple **Candidate PRs** exist, the one merged closest before the Sentry issue first appeared becomes the **Suspected Causing PR**.
- A **Suspected Causing PR** requires a **Service Match** and a **Time Match** within the **Investigation Window**.
- A **Service Match** requires the same **Service Tag** on the Sentry issue and GitHub pull request.
- **Slack Context** strengthens the **Evidence** but is not required to return a **Suspected Causing PR**.
- **Slack Context** requires a **Slack Marker** and must occur inside the **Investigation Window** before the Sentry issue first appears.
- **Synthetic Incident Data** provides the demo records for GitHub, Sentry, and Slack.
- A **Sentry Issue Generator** creates the Sentry part of **Synthetic Incident Data**.
- **Synthetic Incident Data** must live in **Sandbox Sources**.
- A **Live Coral Query** must produce the investigation result from the configured sources.
- **Local Prototype Data** can be used before **Sandbox Sources** are configured, but must not replace the **Live Coral Query** in the final demo.
- The **Investigation Query Template** produces the **Live Coral Query** for a given **Sentry Issue ID**.
- An **Investigation Command** is the first product surface for TraceBullet.
- An **Investigation Command** first produces a **Deterministic Report**.
- An **Investigation Command** can produce a **Machine Report** when requested with a JSON flag.
- A **Deterministic Report** is made of **Report Sections**.
- A **Machine Report** contains the same facts as the **Deterministic Report**.
- A **Narrative Summary** can be added later, but it must only restate the **Deterministic Report**.
- A **Deterministic Report** can include a **Suggested Revert Command** when the Suspected Causing PR has a merge commit.

## Example dialogue

> **Dev:** "Can **TraceBullet** point to a PR if there is no matching Slack message?"
> **Domain expert:** "Yes, if there is a **Service Match** and a **Time Match**. Missing **Slack Context** should be shown as a gap, not treated as a failure."

## Flagged ambiguities

- The original plan compared **TraceBullet**, TrustSync, and ScopeGuard. Resolved: this repo is for **TraceBullet** only; the other two are rejected alternatives.
- "Error ID" and "alert ID" were used loosely. Resolved: the canonical starting input is **Sentry Issue ID**.
- "Root cause" overclaims certainty. Resolved: TraceBullet says **Suspected Causing PR** and shows **Evidence**.
- Slack was described as proof in the original plan. Resolved: **Slack Context** is supporting evidence only; **Service Match** and **Time Match** are required.
- "Shortly before" was vague. Resolved: the **Investigation Window** is 30 minutes before the Sentry issue first appears.
- "Same service" was vague. Resolved: the MVP uses exact **Service Tag** matching, not smart inference.
- Multiple matching pull requests can exist. Resolved: all are **Candidate PRs**, and the closest prior merge becomes the **Suspected Causing PR**.
- No-match cases should not invent a suspect. Resolved: return **No Suspected Causing PR Found** and show which required match was missing.
- Demo data can be synthetic, but the SQL execution cannot be faked. Resolved: use **Synthetic Incident Data** queried by a **Live Coral Query**.
- Real integrations should not touch private work data. Resolved: configure GitHub, Sentry, and Slack with **Sandbox Sources** only.
- The initial product surface was unclear. Resolved: build the **Investigation Command** before a web dashboard.
- The role of an LLM was unclear. Resolved: the MVP produces a **Deterministic Report** first; any **Narrative Summary** is optional formatting.
- The report contents were unclear. Resolved: include Sentry issue, Suspected Causing PR, Evidence, other candidates, missing proof, SQL, and runtime **Report Sections**.
- The SQL author was unclear. Resolved: the MVP uses an **Investigation Query Template**, not AI-generated SQL.
- Rollback behavior was risky. Resolved: show a **Suggested Revert Command** but do not execute it.
- Building a full fake production app is out of scope. Resolved: use a **Sentry Issue Generator** to create the demo issue.
- Slack matching could become fuzzy. Resolved: **Slack Context** requires explicit **Slack Markers** in the MVP.
- Post-incident Slack messages are weaker evidence. Resolved: MVP **Slack Context** must occur before the Sentry issue first appears.
- PagerDuty is useful narrative context but not part of the MVP. Resolved: TraceBullet starts from a **Sentry Issue ID**.
- Datadog would add demo value but also setup risk. Resolved: Datadog is a stretch goal, not part of the MVP.
- Build order was unclear. Resolved: build with **Local Prototype Data** first, then swap to **Sandbox Sources** queried by Coral.
- The implementation language was unclear. Resolved: build the prototype in Node.js/TypeScript so CLI, backend, and later UI can share data shapes.
- The initial TypeScript app shape was unclear. Resolved: start with a plain Node CLI before adding a web framework.
- CLI output format was unclear. Resolved: default to a human **Deterministic Report** and support an optional JSON **Machine Report**.
