import { useMemo, useState } from "react";

const sampleReport = {
  sentryIssue: {
    id: "CHECKOUT-4",
    title: "TraceBullet checkout sandbox error",
    serviceTag: "checkout",
    firstSeenAt: "2026-05-27T20:52:04Z"
  },
  suspectedCausingPr: {
    number: 11,
    title: "Add second checkout Coral sandbox marker",
    author: "sivaratrisrinivas",
    serviceTag: "checkout",
    mergedAt: "2026-05-27T20:48:42Z",
    mergeCommit: "ea7c0847e29ff32cd5d6db6af1f9be36fcc704bf"
  },
  otherCandidatePrs: [],
  missingProof: {
    serviceMatch: false,
    timeMatch: false
  },
  evidence: {
    serviceMatch: "checkout",
    minutesBeforeFirstSeen: 3.3666666666666667,
    slackContext: {
      channel: "#all-coral-tracebullet",
      author: "coral",
      sentAt: "2026-05-27T20:50:57.474059Z",
      text: "Merged PR #11 for checkout test error investigation"
    }
  },
  queryRepresentation: {
    source: "Live Coral Query",
    description:
      "WITH target_sentry_issue AS (...) SELECT sentry.issues, github.pulls, and slack.messages rows narrowed by Service Tag and the 30-minute Investigation Window."
  },
  runtime: {
    source: "Coral Sandbox Sources",
    coralQueryStrategy: "Single Investigation Query",
    investigationWindowMinutes: 30,
    durationMs: 4012
  },
  operationalEnrichment: {
    mode: "Demo Enrichment Data",
    datadog: {
      service: "checkout",
      metric: "tracebullet.synthetic.error_rate",
      observedAt: "2026-05-27T20:51:04.000Z",
      value: 4.8,
      unit: "x baseline",
      summary: "checkout error rate rose near the Sentry first-seen timestamp."
    },
    pagerDuty: {
      incidentId: "PD-CHECKOUT-SANDBOX",
      title: "checkout fatal error spike",
      status: "triggered",
      urgency: "high",
      triggeredAt: "2026-05-27T20:52:04Z",
      summary: "Sandbox incident overlaps the TraceBullet Investigation Window."
    },
    notes: ["Live Coral Enrichment is disabled in the embedded reference trace."]
  },
  narrative: {
    mode: "Deterministic Narrative",
    text:
      "TraceBullet identifies PR #11 as the Suspected Causing PR for CHECKOUT-4. The PR matches Service Tag checkout and was merged 3.37 minutes before first seen. Slack Context links the PR to the pre-incident marker.",
    notes: ["The Machine Report remains the source of truth."]
  }
};

const screens = ["Investigate", "Trace", "Evidence", "Signals", "SQL", "Narrative", "Import"];

export function App() {
  const [report, setReport] = useState(sampleReport);
  const [screen, setScreen] = useState("Investigate");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [apiError, setApiError] = useState("");
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [form, setForm] = useState({
    sentryIssueId: "SENTRY-TB-1001",
    source: "local",
    includeNarrative: true,
    includeEnrichment: true
  });

  const revertCommand = report.suspectedCausingPr?.mergeCommit
    ? `git revert ${report.suspectedCausingPr.mergeCommit}`
    : "unavailable";
  const status = report.suspectedCausingPr ? "Suspect locked" : "No suspect";

  function importDraft() {
    try {
      const next = parseMachineReport(draft);

      if (!next.sentryIssue || !next.runtime || !next.queryRepresentation) {
        throw new Error("Missing Machine Report fields.");
      }

      setReport(next);
      setError("");
      setScreen("Trace");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid JSON.");
    }
  }

  const activePanel = useMemo(() => {
    switch (screen) {
      case "Evidence":
        return <Evidence report={report} revertCommand={revertCommand} />;
      case "Signals":
        return <Signals report={report} />;
      case "SQL":
        return <SqlView report={report} />;
      case "Narrative":
        return <Narrative report={report} />;
      case "Investigate":
        return (
          <InvestigatePanel
            apiError={apiError}
            form={form}
            isInvestigating={isInvestigating}
            report={report}
            setForm={setForm}
            investigate={investigate}
          />
        );
      case "Import":
        return (
          <ImportPanel
            draft={draft}
            error={error}
            setDraft={setDraft}
            importDraft={importDraft}
            reset={() => {
              setReport(sampleReport);
              setDraft("");
              setError("");
              setApiError("");
              setScreen("Trace");
            }}
          />
        );
      default:
        return <Trace report={report} status={status} revertCommand={revertCommand} />;
    }
  }, [apiError, draft, error, form, isInvestigating, report, revertCommand, screen, status]);

  async function investigate() {
    setIsInvestigating(true);
    setApiError("");

    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(form)
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "TraceBullet investigation failed.");
      }

      setReport(payload.report);
      setScreen("Trace");
    } catch (caught) {
      setApiError(caught instanceof Error ? caught.message : "TraceBullet investigation failed.");
    } finally {
      setIsInvestigating(false);
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">TRACEBULLET</p>
          <h1>Incident trace instrument</h1>
        </div>
        <div className="status-light" aria-label={status}>
          <span />
          {status}
        </div>
      </header>

      <section className="workspace">
        <nav className="rail" aria-label="Trace sections">
          {screens.map((item) => (
            <button
              key={item}
              className={screen === item ? "active" : ""}
              type="button"
              onClick={() => setScreen(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <section className="stage" aria-live="polite">
          {activePanel}
        </section>

        <aside className="telemetry" aria-label="Runtime telemetry">
          <Metric label="SOURCE" value={report.runtime.source} />
          <Metric label="STRATEGY" value={report.runtime.coralQueryStrategy ?? "Local"} />
          <Metric label="WINDOW" value={`${report.runtime.investigationWindowMinutes} min`} />
          <Metric label="DURATION" value={`${report.runtime.durationMs} ms`} />
          <Metric label="NARRATIVE" value={report.narrative?.mode ?? "Off"} />
          <Metric label="ENRICHMENT" value={report.operationalEnrichment?.mode ?? "Off"} />
        </aside>
      </section>
    </main>
  );
}

function InvestigatePanel({
  apiError,
  form,
  isInvestigating,
  report,
  setForm,
  investigate
}) {
  return (
    <div className="panel investigate-panel">
      <PanelTitle kicker="INVESTIGATE" title="Run TraceBullet" />
      <div className="investigation-form">
        <label>
          <span>Sentry Issue ID</span>
          <input
            value={form.sentryIssueId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sentryIssueId: event.target.value
              }))
            }
          />
        </label>
        <label>
          <span>Source</span>
          <select
            value={form.source}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                source: event.target.value
              }))
            }
          >
            <option value="local">Local Prototype Data</option>
            <option value="coral">Coral Sandbox Sources</option>
          </select>
        </label>
        <label className="check-row">
          <input
            checked={form.includeNarrative}
            type="checkbox"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                includeNarrative: event.target.checked
              }))
            }
          />
          <span>Local LLM Narrative</span>
        </label>
        <label className="check-row">
          <input
            checked={form.includeEnrichment}
            type="checkbox"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                includeEnrichment: event.target.checked
              }))
            }
          />
          <span>Operational Enrichment</span>
        </label>
      </div>
      {apiError ? <p className="error">{apiError}</p> : null}
      <div className="button-row">
        <button type="button" disabled={isInvestigating} onClick={investigate}>
          {isInvestigating ? "Running" : "Investigate"}
        </button>
      </div>
      <div className="run-summary">
        <Fact label="Current Issue" value={report.sentryIssue.id} />
        <Fact label="Narrative" value={report.narrative?.mode ?? "Off"} />
        <Fact label="Enrichment" value={report.operationalEnrichment?.mode ?? "Off"} />
        <Fact label="Source" value={report.runtime.source} />
      </div>
    </div>
  );
}

function parseMachineReport(input) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Paste a Machine Report JSON payload.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("No JSON object found in pasted input.");
    }

    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
}

function Trace({ report, status, revertCommand }) {
  return (
    <div className="panel trace-panel">
      <div className="panel-head">
        <p className="eyebrow">TRACE</p>
        <h2>{report.sentryIssue.id}</h2>
        <p>{report.sentryIssue.title}</p>
      </div>
      <div className="trace-grid">
        <TraceNode label="SENTRY" title={report.sentryIssue.serviceTag} detail={report.sentryIssue.firstSeenAt} />
        <TraceNode
          label="GITHUB"
          title={report.suspectedCausingPr ? `PR #${report.suspectedCausingPr.number}` : "No PR"}
          detail={report.suspectedCausingPr?.title ?? "No Suspected Causing PR Found"}
        />
        <TraceNode
          label="SLACK"
          title={report.evidence.slackContext?.channel ?? "missing"}
          detail={report.evidence.slackContext?.text ?? "Slack Context missing"}
        />
      </div>
      <div className="command-strip">
        <span>{status}</span>
        <code>{revertCommand}</code>
      </div>
    </div>
  );
}

function Evidence({ report, revertCommand }) {
  const pr = report.suspectedCausingPr;

  return (
    <div className="panel">
      <PanelTitle kicker="EVIDENCE" title={pr ? `PR #${pr.number}` : "No Suspected Causing PR Found"} />
      <div className="facts">
        <Fact label="Service Match" value={report.evidence.serviceMatch ?? "missing"} />
        <Fact
          label="Time Match"
          value={
            report.evidence.minutesBeforeFirstSeen !== undefined
              ? `${round(report.evidence.minutesBeforeFirstSeen)} minutes before first seen`
              : "missing"
          }
        />
        <Fact label="Author" value={pr?.author ?? "missing"} />
        <Fact label="Merge Commit" value={pr?.mergeCommit ?? "missing"} mono />
      </div>
      <div className="wide-line">
        <span>Suggested Revert Command</span>
        <code>{revertCommand}</code>
      </div>
    </div>
  );
}

function Signals({ report }) {
  const enrichment = report.operationalEnrichment;

  return (
    <div className="panel">
      <PanelTitle kicker="SIGNALS" title={enrichment?.mode ?? "Operational Enrichment off"} />
      <div className="signal-grid">
        <SignalCard title="Datadog" signal={enrichment?.datadog} />
        <SignalCard title="PagerDuty" signal={enrichment?.pagerDuty} />
      </div>
      <ul className="notes">
        {(enrichment?.notes ?? ["No Operational Enrichment attached."]).map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function SqlView({ report }) {
  return (
    <div className="panel">
      <PanelTitle kicker="SQL" title={report.queryRepresentation.source} />
      <pre className="sql-box">{report.queryRepresentation.description}</pre>
      {report.operationalEnrichment?.queryRepresentation ? (
        <div className="split-code">
          <pre>{report.operationalEnrichment.queryRepresentation.datadog}</pre>
          <pre>{report.operationalEnrichment.queryRepresentation.pagerDuty}</pre>
        </div>
      ) : null}
    </div>
  );
}

function Narrative({ report }) {
  return (
    <div className="panel narrative">
      <PanelTitle kicker="NARRATIVE" title={report.narrative?.mode ?? "Narrative off"} />
      <p>{report.narrative?.text ?? "Run with --narrative to attach a Narrative Summary."}</p>
      <ul className="notes">
        {(report.narrative?.notes ?? []).map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function ImportPanel({ draft, error, setDraft, importDraft, reset }) {
  return (
    <div className="panel import-panel">
      <PanelTitle kicker="IMPORT" title="Machine Report" />
      <textarea
        aria-label="Machine Report JSON"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder='{"sentryIssue":...}'
      />
      {error ? <p className="error">{error}</p> : null}
      <div className="button-row">
        <button type="button" onClick={importDraft}>
          Load
        </button>
        <button type="button" className="secondary" onClick={reset}>
          Reset
        </button>
      </div>
    </div>
  );
}

function SignalCard({ title, signal }) {
  return (
    <article className="signal-card">
      <p className="eyebrow">{title}</p>
      <h3>{signal?.summary ?? "unavailable"}</h3>
      {signal ? (
        <dl>
          {Object.entries(signal).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

function TraceNode({ label, title, detail }) {
  return (
    <article className="trace-node">
      <p>{label}</p>
      <h3>{title}</h3>
      <span>{detail}</span>
    </article>
  );
}

function PanelTitle({ kicker, title }) {
  return (
    <div className="panel-title">
      <p className="eyebrow">{kicker}</p>
      <h2>{title}</h2>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Fact({ label, value, mono = false }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>
  );
}

function round(value) {
  return Math.round(value * 100) / 100;
}
