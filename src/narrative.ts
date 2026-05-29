import { spawnSync } from "node:child_process";
import type { InvestigationReport, NarrativeSummary } from "./investigation.ts";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen3:0.6b";

export function addNarrativeSummary(
  report: InvestigationReport,
  env: NodeJS.ProcessEnv = process.env
): InvestigationReport {
  return {
    ...report,
    narrative: loadNarrativeSummary(report, env)
  };
}

export function buildDeterministicNarrative(report: InvestigationReport): string {
  if (!report.suspectedCausingPr) {
    const missing = [
      report.missingProof.serviceMatch ? "Service Match" : undefined,
      report.missingProof.timeMatch ? "Time Match" : undefined
    ]
      .filter(Boolean)
      .join(" and ");

    return `TraceBullet found no Suspected Causing PR for ${report.sentryIssue.id}. Missing Proof: ${missing || "none reported"}.`;
  }

  const slackText = report.evidence.slackContext
    ? ` Slack Context: "${trimTrailingSentencePunctuation(report.evidence.slackContext.text)}."`
    : " Slack Context is missing, so the result rests on Service Match and Time Match.";
  const revertText = report.suspectedCausingPr.mergeCommit
    ? ` Suggested Revert Command: git revert ${report.suspectedCausingPr.mergeCommit}.`
    : " Suggested Revert Command is unavailable because the merge commit is missing.";

  return `TraceBullet identifies PR #${report.suspectedCausingPr.number} as the Suspected Causing PR for ${report.sentryIssue.id}. The PR matches Service Tag ${report.sentryIssue.serviceTag} and was merged ${report.evidence.minutesBeforeFirstSeen} minutes before first seen.${slackText}${revertText}`;
}

function loadNarrativeSummary(
  report: InvestigationReport,
  env: NodeJS.ProcessEnv
): NarrativeSummary {
  const model = env.TRACEBULLET_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;

  if (env.TRACEBULLET_NARRATIVE_MODE === "deterministic") {
    return {
      mode: "Deterministic Narrative",
      text: buildDeterministicNarrative(report),
      notes: ["Local LLM Narrative was skipped by TRACEBULLET_NARRATIVE_MODE=deterministic."]
    };
  }

  try {
    const text = callOllama(report, env);

    return {
      mode: "Local LLM Narrative",
      model,
      text: sanitizeNarrativeText(text),
      notes: [
        "Local LLM Narrative summarizes only the Machine Report. The Machine Report remains the source of truth."
      ]
    };
  } catch (error) {
    return {
      mode: "Deterministic Narrative",
      model,
      text: buildDeterministicNarrative(report),
      notes: [
        `Local LLM Narrative failed: ${readErrorMessage(error)}`,
        "Using deterministic narrative fallback."
      ]
    };
  }
}

function callOllama(report: InvestigationReport, env: NodeJS.ProcessEnv): string {
  const url = new URL("/api/generate", env.TRACEBULLET_OLLAMA_URL ?? DEFAULT_OLLAMA_URL);
  const payload = {
    model: env.TRACEBULLET_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
    stream: false,
    system:
      "You summarize TraceBullet Machine Reports for an on-call engineer. Use only supplied facts. Say Suspected Causing PR, never root cause. Keep the response under 90 words.",
    prompt: JSON.stringify(buildNarrativeFacts(report)),
    options: {
      temperature: 0,
      num_predict: 140
    }
  };
  const result = spawnSync(
    "curl",
    [
      "--silent",
      "--show-error",
      "--fail-with-body",
      "--max-time",
      "4",
      url.toString(),
      "-H",
      "content-type: application/json",
      "-d",
      JSON.stringify(payload)
    ],
    {
      encoding: "utf8"
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || "Ollama request failed."
    );
  }

  const parsed = JSON.parse(result.stdout);

  if (!parsed.response || typeof parsed.response !== "string") {
    throw new Error("Ollama response did not include a text response.");
  }

  return parsed.response.trim();
}

function buildNarrativeFacts(report: InvestigationReport) {
  return {
    sentryIssue: report.sentryIssue,
    suspectedCausingPr: report.suspectedCausingPr,
    evidence: report.evidence,
    missingProof: report.missingProof,
    operationalEnrichment: report.operationalEnrichment,
    suggestedRevertCommand: report.suspectedCausingPr?.mergeCommit
      ? `git revert ${report.suspectedCausingPr.mergeCommit}`
      : undefined
  };
}

function sanitizeNarrativeText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\broot cause\b/gi, "Suspected Causing PR")
    .replace(/\bguilty PR\b/gi, "Suspected Causing PR")
    .trim();
}

function trimTrailingSentencePunctuation(text: string): string {
  return text.replace(/[.!?]+$/u, "");
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown narrative failure.";
}
