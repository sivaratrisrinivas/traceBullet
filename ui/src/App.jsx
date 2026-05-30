import { useMemo, useState } from "react";
import traceField from "./assets/trace-field.png";

const SOURCE_DEFAULTS = {
  coral: "CHECKOUT-4",
  local: "SENTRY-TB-1001"
};

export function App() {
  const [screen, setScreen] = useState("source");
  const [report, setReport] = useState(null);
  const [apiError, setApiError] = useState("");
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [form, setForm] = useState({
    sentryIssueId: SOURCE_DEFAULTS.coral,
    source: "coral"
  });
  const [gaze, setGaze] = useState({ x: 58, y: 46 });

  function trackGaze(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setGaze({
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100
    });
  }

  function chooseSource(source) {
    setForm({
      source,
      sentryIssueId: SOURCE_DEFAULTS[source]
    });
    setApiError("");
    setScreen("target");
  }

  async function investigate(event) {
    event.preventDefault();
    setIsInvestigating(true);
    setApiError("");
    setScreen("running");

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
      setScreen("result");
    } catch (caught) {
      setApiError(caught instanceof Error ? caught.message : "TraceBullet investigation failed.");
      setScreen("target");
    } finally {
      setIsInvestigating(false);
    }
  }

  function resetInvestigation() {
    setReport(null);
    setApiError("");
    setScreen("source");
  }

  return (
    <main
      className="app-shell"
      onPointerMove={trackGaze}
      style={{ "--gaze-x": `${gaze.x}%`, "--gaze-y": `${gaze.y}%` }}
    >
      <img className="trace-field" src={traceField} alt="" aria-hidden="true" />
      <div className="atmosphere" aria-hidden="true" />
      <div className="aperture" aria-hidden="true" />
      <Brand />

      {screen === "source" ? <SourceScreen chooseSource={chooseSource} /> : null}
      {screen === "target" ? (
        <TargetScreen
          apiError={apiError}
          form={form}
          investigate={investigate}
          setForm={setForm}
        />
      ) : null}
      {screen === "running" ? <RunningScreen form={form} isInvestigating={isInvestigating} /> : null}
      {screen === "result" && report ? (
        <DecisionBrief report={report} resetInvestigation={resetInvestigation} />
      ) : null}
    </main>
  );
}

function Brand() {
  return (
    <header className="brand-rail" aria-label="TraceBullet">
      <div className="brand-glyph" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>TraceBullet</p>
    </header>
  );
}

function SourceScreen({ chooseSource }) {
  return (
    <section className="screen source-screen" aria-labelledby="source-title">
      <div className="focus-copy">
        <p className="kicker">Investigation Source</p>
        <h1 id="source-title">Choose the signal field.</h1>
        <p className="whisper">
          TraceBullet will look through one source path at a time and keep the rest out of view.
        </p>
      </div>

      <button className="source-orb primary-action" type="button" onClick={() => chooseSource("coral")}>
        <span>Coral Sandbox Sources</span>
        <strong>Live Sentry, GitHub, Slack</strong>
      </button>
    </section>
  );
}

function TargetScreen({ apiError, form, investigate, setForm }) {
  return (
    <section className="screen target-screen" aria-labelledby="target-title">
      <form className="target-instrument" onSubmit={investigate}>
        <p className="kicker">{form.source === "coral" ? "Coral Locked" : "Local Locked"}</p>
        <h1 id="target-title">Name the fault.</h1>
        <label className="target-field">
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
        {apiError ? <p className="error">{apiError}</p> : null}
        <button className="primary-action" type="submit">
          Fire TraceBullet
        </button>
      </form>
    </section>
  );
}

function RunningScreen({ form }) {
  return (
    <section className="screen running-screen" aria-labelledby="running-title" aria-live="polite">
      <div className="pulse-core" aria-hidden="true">
        <span />
      </div>
      <div className="run-copy">
        <p className="kicker">{form.sentryIssueId}</p>
        <h1 id="running-title">Following the trace.</h1>
        <p className="whisper">Correlating issue, merge window, Slack context, enrichment, and narrative.</p>
      </div>
    </section>
  );
}

function DecisionBrief({ report, resetInvestigation }) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = useMemo(() => getInvestigationSteps(report), [report]);
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
    <section className="screen result-screen" aria-labelledby="result-title" aria-live="polite">
      <div className="evidence-orbit" aria-hidden="true">
        {steps.map((item, index) => (
          <i
            key={item.kicker}
            className={index <= stepIndex ? "is-lit" : ""}
            style={{ "--dot-index": index, "--dot-count": steps.length }}
          />
        ))}
      </div>

      <article className="evidence-aperture">
        <p className="kicker">{step.kicker}</p>
        <h1 id="result-title">{step.title}</h1>
        <p className="focus-detail">{step.detail}</p>
        {step.meta ? <p className="signal-note">{step.meta}</p> : null}
        {step.code ? <code>{step.code}</code> : null}
      </article>

      <div className="step-footer">
        <span>
          {String(stepIndex + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
        </span>
        <button className="primary-action compact-action" type="button" onClick={advance}>
          {isLastStep ? "Close Trace" : step.action}
        </button>
      </div>
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
      action: "Reveal Sentry",
      kicker: "Suspected Causing PR",
      title: verdict,
      detail: pr
        ? "The strongest candidate is isolated. The next screens reveal only the proof under the aperture."
        : "No PR reached the evidence threshold inside the Investigation Window.",
      meta: `${confidence}/3 evidence checks matched`
    },
    {
      action: "Reveal Service",
      kicker: report.sentryIssue.id,
      title: report.sentryIssue.title,
      detail: `First seen ${report.sentryIssue.firstSeenAt}.`,
      meta: `Service Tag ${report.sentryIssue.serviceTag}`
    },
    {
      action: "Reveal Time",
      kicker: "Service Match",
      title: report.evidence.serviceMatch ?? "missing",
      detail: "The Sentry issue and the candidate PR speak the same service language.",
      meta: report.missingProof.serviceMatch ? "Missing Proof" : "Matched"
    },
    {
      action: "Reveal Slack",
      kicker: "Time Match",
      title: minutesBeforeFirstSeen,
      detail: "The merge sits inside the 30-minute Investigation Window before first seen.",
      meta: report.missingProof.timeMatch ? "Missing Proof" : "Matched"
    },
    {
      action: "Reveal PR",
      kicker: "Slack Context",
      title: report.evidence.slackContext?.channel ?? "missing",
      detail: report.evidence.slackContext?.text ?? "No nearby Slack Context was attached.",
      meta: report.evidence.slackContext?.sentAt
    },
    {
      action: "Reveal Ops",
      kicker: "Candidate Merge",
      title: pr?.title ?? "No candidate matched the investigation window.",
      detail: pr ? `Merged by ${pr.author} at ${pr.mergedAt}.` : "No PR details are available.",
      meta: pr ? `Merge commit ${pr.mergeCommit}` : undefined
    },
    {
      action: "Reveal Narrative",
      kicker: report.operationalEnrichment?.mode ?? "Operational Enrichment off",
      title: report.operationalEnrichment?.datadog?.summary ?? "No operational signal attached",
      detail: report.operationalEnrichment?.pagerDuty?.summary ?? "PagerDuty context is unavailable.",
      meta: report.runtime?.source
    },
    {
      action: "Reveal Command",
      kicker: report.narrative?.mode ?? "Narrative unavailable",
      title: report.narrative?.provider ? `${report.narrative.provider} narrative` : "Narrative Summary",
      detail: report.narrative?.text ?? "Narrative Summary was not attached.",
      meta: report.narrative?.model
    },
    {
      action: "Close Trace",
      kicker: "Suggested Revert Command",
      title: "Operator decision point.",
      detail: "This command is derived from the Machine Report; TraceBullet never executes it.",
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
