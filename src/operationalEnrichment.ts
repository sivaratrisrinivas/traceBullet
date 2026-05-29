import type { CoralQueryEnvironment, CoralQueryRunner } from "./coralSandboxData.ts";
import type { InvestigationReport, OperationalEnrichment } from "./investigation.ts";

type EnrichmentRows = {
  datadogRows: Array<Record<string, unknown>>;
  pagerDutyRows: Array<Record<string, unknown>>;
};

export function addOperationalEnrichment(
  report: InvestigationReport,
  env: CoralQueryEnvironment,
  runCoralQuery?: CoralQueryRunner
): InvestigationReport {
  return {
    ...report,
    operationalEnrichment: loadOperationalEnrichment(report, env, runCoralQuery)
  };
}

export function buildLiveDatadogEnrichmentQuery(
  report: InvestigationReport,
  env: CoralQueryEnvironment = process.env
): string {
  return readQueryTemplate(
    report,
    env,
    "TRACEBULLET_DATADOG_ENRICHMENT_QUERY",
    "Datadog"
  );
}

export function buildLivePagerDutyEnrichmentQuery(
  report: InvestigationReport,
  env: CoralQueryEnvironment = process.env
): string {
  return readQueryTemplate(
    report,
    env,
    "TRACEBULLET_PAGERDUTY_ENRICHMENT_QUERY",
    "PagerDuty"
  );
}

function loadOperationalEnrichment(
  report: InvestigationReport,
  env: CoralQueryEnvironment,
  runCoralQuery?: CoralQueryRunner
): OperationalEnrichment {
  if (!report.suspectedCausingPr) {
    return {
      mode: "Unavailable",
      notes: ["Operational Enrichment is skipped when there is no Suspected Causing PR."]
    };
  }

  if (env.TRACEBULLET_ENABLE_LIVE_ENRICHMENTS === "true" && runCoralQuery) {
    try {
      if (
        !env.TRACEBULLET_DATADOG_ENRICHMENT_QUERY &&
        !env.TRACEBULLET_PAGERDUTY_ENRICHMENT_QUERY
      ) {
        return buildDemoEnrichment(report, [
          "Live Coral Enrichment is enabled, but no Datadog or PagerDuty enrichment query template is configured.",
          "Set TRACEBULLET_DATADOG_ENRICHMENT_QUERY or TRACEBULLET_PAGERDUTY_ENRICHMENT_QUERY to query optional live Coral sources."
        ]);
      }

      const queryRepresentation = {
        ...(env.TRACEBULLET_DATADOG_ENRICHMENT_QUERY
          ? { datadog: buildLiveDatadogEnrichmentQuery(report, env) }
          : {}),
        ...(env.TRACEBULLET_PAGERDUTY_ENRICHMENT_QUERY
          ? { pagerDuty: buildLivePagerDutyEnrichmentQuery(report, env) }
          : {})
      };
      const rows = loadLiveRows(queryRepresentation, env, runCoralQuery);
      const liveEnrichment = normalizeLiveEnrichment(rows, queryRepresentation);

      if (liveEnrichment.datadog || liveEnrichment.pagerDuty) {
        return liveEnrichment;
      }

      return buildDemoEnrichment(report, [
        "Live Coral Enrichment returned no Datadog or PagerDuty rows; using deterministic demo enrichment."
      ]);
    } catch (error) {
      return buildDemoEnrichment(report, [
        `Live Coral Enrichment failed: ${readErrorMessage(error)}`,
        "Using deterministic demo enrichment instead."
      ]);
    }
  }

  return buildDemoEnrichment(report, [
    "Live Coral Enrichment is disabled. Set TRACEBULLET_ENABLE_LIVE_ENRICHMENTS=true to query optional Datadog and PagerDuty sources."
  ]);
}

function loadLiveRows(
  queryRepresentation: NonNullable<OperationalEnrichment["queryRepresentation"]>,
  env: CoralQueryEnvironment,
  runCoralQuery: CoralQueryRunner
): EnrichmentRows {
  const datadogRows = queryRepresentation.datadog
    ? JSON.parse(runCoralQuery(queryRepresentation.datadog, env))
    : [];
  const pagerDutyRows = queryRepresentation.pagerDuty
    ? JSON.parse(runCoralQuery(queryRepresentation.pagerDuty, env))
    : [];

  return {
    datadogRows: Array.isArray(datadogRows) ? datadogRows : [datadogRows],
    pagerDutyRows: Array.isArray(pagerDutyRows) ? pagerDutyRows : [pagerDutyRows]
  };
}

function normalizeLiveEnrichment(
  rows: EnrichmentRows,
  queryRepresentation: NonNullable<OperationalEnrichment["queryRepresentation"]>
): OperationalEnrichment {
  const datadogRow = rows.datadogRows.find(
    (row) => readRowValue(row, "recordSet") === "datadogSignals"
  );
  const pagerDutyRow = rows.pagerDutyRows.find(
    (row) => readRowValue(row, "recordSet") === "pagerDutyIncidents"
  );

  return {
    mode: "Live Coral Enrichment",
    ...(datadogRow
      ? {
          datadog: {
            service: String(readRowValue(datadogRow, "service")),
            metric: String(readRowValue(datadogRow, "metric")),
            observedAt: String(readRowValue(datadogRow, "observedAt")),
            value: Number(readRowValue(datadogRow, "value")),
            unit: String(readRowValue(datadogRow, "unit")),
            summary: String(readRowValue(datadogRow, "summary"))
          }
        }
      : {}),
    ...(pagerDutyRow
      ? {
          pagerDuty: {
            incidentId: String(readRowValue(pagerDutyRow, "incidentId")),
            title: String(readRowValue(pagerDutyRow, "title")),
            status: String(readRowValue(pagerDutyRow, "status")),
            urgency: String(readRowValue(pagerDutyRow, "urgency")),
            triggeredAt: String(readRowValue(pagerDutyRow, "triggeredAt")),
            summary: String(readRowValue(pagerDutyRow, "summary"))
          }
        }
      : {}),
    queryRepresentation,
    notes: ["Optional Datadog/PagerDuty rows came from live Coral queries."]
  };
}

function buildDemoEnrichment(
  report: InvestigationReport,
  notes: string[]
): OperationalEnrichment {
  const firstSeenAt = new Date(report.sentryIssue.firstSeenAt);
  const observedAt = Number.isNaN(firstSeenAt.getTime())
    ? report.sentryIssue.firstSeenAt
    : new Date(firstSeenAt.getTime() - 60 * 1000).toISOString();

  return {
    mode: "Demo Enrichment Data",
    datadog: {
      service: report.sentryIssue.serviceTag,
      metric: "tracebullet.synthetic.error_rate",
      observedAt,
      value: 4.8,
      unit: "x baseline",
      summary: `${report.sentryIssue.serviceTag} error rate rose near the Sentry first-seen timestamp.`
    },
    pagerDuty: {
      incidentId: `PD-${report.sentryIssue.serviceTag.toUpperCase()}-SANDBOX`,
      title: `${report.sentryIssue.serviceTag} fatal error spike`,
      status: "triggered",
      urgency: "high",
      triggeredAt: report.sentryIssue.firstSeenAt,
      summary: "Sandbox incident overlaps the TraceBullet Investigation Window."
    },
    notes
  };
}

function readRowValue(row: Record<string, unknown>, key: string): unknown {
  return row[key] ?? row[key.toLowerCase()];
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown enrichment failure.";
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function readQueryTemplate(
  report: InvestigationReport,
  env: CoralQueryEnvironment,
  envKey: "TRACEBULLET_DATADOG_ENRICHMENT_QUERY" | "TRACEBULLET_PAGERDUTY_ENRICHMENT_QUERY",
  sourceName: string
): string {
  const template = env[envKey];

  if (!template) {
    throw new Error(`${sourceName} enrichment requires ${envKey}.`);
  }

  return template
    .replaceAll("{{SERVICE_TAG}}", escapeSqlLiteral(report.sentryIssue.serviceTag))
    .replaceAll("{{SENTRY_ISSUE_ID}}", escapeSqlLiteral(report.sentryIssue.id))
    .replaceAll("{{FIRST_SEEN_AT}}", escapeSqlLiteral(report.sentryIssue.firstSeenAt))
    .replaceAll(
      "{{PR_NUMBER}}",
      report.suspectedCausingPr ? String(report.suspectedCausingPr.number) : ""
    )
    .replaceAll(
      "{{MERGE_COMMIT}}",
      report.suspectedCausingPr?.mergeCommit
        ? escapeSqlLiteral(report.suspectedCausingPr.mergeCommit)
        : ""
    );
}
