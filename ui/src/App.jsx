import { useState } from "react";

export function App() {
  const [report, setReport] = useState(null);
  const [apiError, setApiError] = useState("");
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [form, setForm] = useState({
    sentryIssueId: "SENTRY-TB-1001",
    source: "local"
  });

  async function investigate(event) {
    event.preventDefault();
    setIsInvestigating(true);
    setApiError("");

    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...form,
          includeNarrative: true,
          includeEnrichment: true
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "TraceBullet investigation failed.");
      }

      setReport(payload.report);
    } catch (caught) {
      setApiError(caught instanceof Error ? caught.message : "TraceBullet investigation failed.");
    } finally {
      setIsInvestigating(false);
    }
  }

  function resetInvestigation() {
    setReport(null);
    setApiError("");
  }

  return (
    <main className="app-shell">
      {!report ? (
        <InvestigateScreen
          apiError={apiError}
          form={form}
          isInvestigating={isInvestigating}
          setForm={setForm}
          investigate={investigate}
        />
      ) : (
        <DecisionBrief report={report} resetInvestigation={resetInvestigation} />
      )}
    </main>
  );
}

function InvestigateScreen({ apiError, form, isInvestigating, setForm, investigate }) {
  return (
    <section className="screen investigate-screen" aria-labelledby="investigate-title">
      <div className="brand-mark">
        <span>TraceBullet</span>
      </div>

      <div className="investigate-copy">
        <p className="eyebrow">Investigation Command</p>
        <h1 id="investigate-title">Find the Suspected Causing PR.</h1>
      </div>

      <form className="command-form" onSubmit={investigate}>
        <label className="field">
          <span>Sentry Issue ID</span>
          <input
            autoComplete="off"
            autoFocus
            value={form.sentryIssueId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sentryIssueId: event.target.value
              }))
            }
          />
        </label>

        <label className="field">
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

        {apiError ? <p className="error">{apiError}</p> : null}

        <button className="primary-action" type="submit" disabled={isInvestigating}>
          {isInvestigating ? "Running investigation" : "Run investigation"}
        </button>
      </form>
    </section>
  );
}

function DecisionBrief({ report, resetInvestigation }) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = getInvestigationSteps(report);
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  function advance() {
    if (isLastStep) {
      resetInvestigation();
      return;
    }

    setStepIndex((current) => current + 1);
  }

  return (
    <section className="screen focus-screen" aria-labelledby="focus-title" aria-live="polite">
      <div className="brand-mark">
        <span>TraceBullet</span>
      </div>

      <div className="focus-meter" aria-label={`Investigation step ${stepIndex + 1} of ${steps.length}`}>
        <span>{String(stepIndex + 1).padStart(2, "0")}</span>
        <div>
          <i style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>
        <span>{String(steps.length).padStart(2, "0")}</span>
      </div>

      <article className="focus-card">
        <p className="eyebrow">{step.kicker}</p>
        <h1 id="focus-title">{step.title}</h1>
        <p className="focus-detail">{step.detail}</p>
        {step.code ? <code>{step.code}</code> : null}
      </article>

      <button className="primary-action focus-action" type="button" onClick={advance}>
        {isLastStep ? "Start another investigation" : "Continue"}
      </button>
    </section>
  );
}

function getInvestigationSteps(report) {
  const pr = report.suspectedCausingPr;
  const revertCommand = pr?.mergeCommit ? `git revert ${pr.mergeCommit}` : "unavailable";
  const minutesBeforeFirstSeen =
    report.evidence.minutesBeforeFirstSeen !== undefined
      ? `${round(report.evidence.minutesBeforeFirstSeen)} minutes before first seen`
      : "missing";
  const verdict = pr ? `PR #${pr.number}` : "No Suspected Causing PR";
  const confidence = getEvidenceCount(report);

  return [
    {
      kicker: report.sentryIssue.id,
      title: verdict,
      detail: pr
        ? "TraceBullet found one PR that best matches the Machine Report evidence."
        : "TraceBullet did not find a PR with enough evidence inside the Investigation Window."
    },
    {
      kicker: "Sentry",
      title: report.sentryIssue.title,
      detail: `Service Tag ${report.sentryIssue.serviceTag}; first seen ${report.sentryIssue.firstSeenAt}.`
    },
    {
      kicker: "Service Match",
      title: report.evidence.serviceMatch ?? "missing",
      detail: "The candidate PR and Sentry issue must speak the same service language."
    },
    {
      kicker: "Time Match",
      title: minutesBeforeFirstSeen,
      detail: "The merge sits inside the 30-minute Investigation Window before first seen."
    },
    {
      kicker: "Slack Context",
      title: report.evidence.slackContext?.channel ?? "missing",
      detail: report.evidence.slackContext?.text ?? "No nearby Slack Context was attached."
    },
    {
      kicker: "Suspected Causing PR",
      title: pr?.title ?? "No candidate matched the investigation window.",
      detail: pr ? `Merged by ${pr.author} at ${pr.mergedAt}.` : "No PR details are available."
    },
    {
      kicker: report.operationalEnrichment?.mode ?? "Operational Enrichment off",
      title: report.operationalEnrichment?.datadog?.summary ?? "No operational signal attached",
      detail: report.operationalEnrichment?.pagerDuty?.summary ?? "PagerDuty context is unavailable."
    },
    {
      kicker: "Evidence Count",
      title: `${confidence}/3 matched`,
      detail: "Service Match, Time Match, and Slack Context are the focused evidence checks."
    },
    {
      kicker: "Narrative Summary",
      title: report.narrative?.mode ?? "Narrative unavailable",
      detail: report.narrative?.text ?? "Narrative Summary was not attached."
    },
    {
      kicker: "Suggested Revert Command",
      title: "Ready when the operator decides.",
      detail: "This command is derived from the Machine Report; it is not executed by TraceBullet.",
      code: revertCommand
    }
  ];
}

function getEvidenceCount(report) {
  return [
    report.evidence.serviceMatch,
    report.evidence.minutesBeforeFirstSeen !== undefined,
    report.evidence.slackContext
  ].filter(Boolean).length;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
