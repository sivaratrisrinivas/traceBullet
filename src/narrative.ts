import { spawnSync } from "node:child_process";
import type { InvestigationReport, NarrativeSummary } from "./investigation.ts";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen3:0.6b";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

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
  const provider = env.TRACEBULLET_NARRATIVE_PROVIDER ?? "ollama";

  if (env.TRACEBULLET_NARRATIVE_MODE === "deterministic") {
    return {
      mode: "Deterministic Narrative",
      text: buildDeterministicNarrative(report),
      notes: ["LLM Narrative was skipped by TRACEBULLET_NARRATIVE_MODE=deterministic."]
    };
  }

  if (provider === "gemini") {
    return loadGeminiNarrativeSummary(report, env);
  }

  return loadOllamaNarrativeSummary(report, env);
}

function loadGeminiNarrativeSummary(
  report: InvestigationReport,
  env: NodeJS.ProcessEnv
): NarrativeSummary {
  const configuredModel = env.TRACEBULLET_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;

  try {
    const response = callGeminiWithFallback(report, env);

    return {
      mode: "Cloud LLM Narrative",
      provider: "gemini",
      model: response.model,
      text: sanitizeNarrativeText(response.text),
      notes: [
        "Gemini summarizes only the Machine Report. The Machine Report remains the source of truth.",
        ...(response.model !== configuredModel
          ? [`Gemini fallback model used after ${configuredModel} returned an unusable response.`]
          : [])
      ]
    };
  } catch (error) {
    return {
      mode: "Deterministic Narrative",
      provider: "gemini",
      model: configuredModel,
      text: buildDeterministicNarrative(report),
      notes: [
        `Gemini Narrative failed: ${readErrorMessage(error)}`,
        "Using deterministic narrative fallback."
      ]
    };
  }
}

function callGeminiWithFallback(
  report: InvestigationReport,
  env: NodeJS.ProcessEnv
): { model: string; text: string } {
  const configuredModel = env.TRACEBULLET_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const fallbackModel = env.TRACEBULLET_GEMINI_FALLBACK_MODEL ?? DEFAULT_GEMINI_FALLBACK_MODEL;
  const models = [...new Set([configuredModel, fallbackModel].filter(Boolean))];
  let lastError: Error | undefined;

  for (const model of models) {
    try {
      return {
        model,
        text: callGemini(report, env, model)
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gemini request failed.");
    }
  }

  throw lastError ?? new Error("Gemini request failed.");
}

function loadOllamaNarrativeSummary(
  report: InvestigationReport,
  env: NodeJS.ProcessEnv
): NarrativeSummary {
  const model = env.TRACEBULLET_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;

  try {
    const text = callOllama(report, env);

    return {
      mode: "Local LLM Narrative",
      provider: "ollama",
      model,
      text: sanitizeNarrativeText(text),
      notes: [
        "Local LLM Narrative summarizes only the Machine Report. The Machine Report remains the source of truth."
      ]
    };
  } catch (error) {
    return {
      mode: "Deterministic Narrative",
      provider: "ollama",
      model,
      text: buildDeterministicNarrative(report),
      notes: [
        `Local LLM Narrative failed: ${readErrorMessage(error)}`,
        "Using deterministic narrative fallback."
      ]
    };
  }
}

function callGemini(
  report: InvestigationReport,
  env: NodeJS.ProcessEnv,
  model = env.TRACEBULLET_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
): string {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini narrative requires GEMINI_API_KEY or GOOGLE_API_KEY.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;
  const payload = {
    systemInstruction: {
      parts: [
        {
          text:
            "You summarize TraceBullet Machine Reports for an on-call engineer. Use only supplied facts. Say Suspected Causing PR, never root cause. Return one plain-text paragraph under 90 words. Do not use Markdown."
        }
      ]
    },
    contents: [
      {
        parts: [
          {
            text: buildGeminiNarrativePrompt(report)
          }
        ]
      }
    ],
    generationConfig: buildGeminiGenerationConfig(model)
  };
  const result = spawnSync(
    "curl",
    [
      "--silent",
      "--show-error",
      "--fail-with-body",
      "--max-time",
      "10",
      url,
      "-H",
      `x-goog-api-key: ${apiKey}`,
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
      result.stderr.trim() || result.stdout.trim() || "Gemini request failed."
    );
  }

  const parsed = JSON.parse(result.stdout);
  const text = sanitizeNarrativeText(
    parsed.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim() ?? ""
  );

  if (!text || text.split(/\s+/u).filter(Boolean).length < 4) {
    throw new Error("Gemini response did not include text content.");
  }

  if (
    !/\bSuspected Causing PR\b/u.test(text) &&
    !/\bPR\s*#?\d+\b/u.test(text)
  ) {
    throw new Error("Gemini response did not mention the Suspected Causing PR.");
  }

  return text;
}

function buildGeminiGenerationConfig(model: string) {
  return {
    temperature: 0,
    maxOutputTokens: 256,
    thinkingConfig: model.includes("2.5")
      ? {
          thinkingBudget: 0
        }
      : {
          thinkingLevel: "minimal"
        }
  };
}

function buildGeminiNarrativePrompt(report: InvestigationReport): string {
  return [
    "Write exactly one plain-text sentence using these facts.",
    "The sentence must include the phrase Suspected Causing PR and the PR number.",
    `Sentry Issue ID: ${report.sentryIssue.id}`,
    `Sentry Title: ${report.sentryIssue.title}`,
    `Service Tag: ${report.sentryIssue.serviceTag}`,
    `First Seen: ${report.sentryIssue.firstSeenAt}`,
    report.suspectedCausingPr
      ? `Suspected Causing PR: #${report.suspectedCausingPr.number}`
      : "Suspected Causing PR: none",
    report.suspectedCausingPr
      ? `PR Title: ${report.suspectedCausingPr.title}`
      : "PR Title: none",
    report.suspectedCausingPr
      ? `PR Author: ${report.suspectedCausingPr.author}`
      : "PR Author: none",
    report.suspectedCausingPr
      ? `Merged At: ${report.suspectedCausingPr.mergedAt}`
      : "Merged At: none",
    report.evidence.minutesBeforeFirstSeen !== undefined
      ? `Time Match: ${report.evidence.minutesBeforeFirstSeen} minutes before first seen`
      : "Time Match: missing",
    report.evidence.slackContext
      ? `Slack Context: ${report.evidence.slackContext.text}`
      : "Slack Context: missing"
  ].join("\n");
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
    .replace(/\*\*/g, "")
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
