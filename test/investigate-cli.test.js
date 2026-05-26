import { test } from "node:test";
import assert from "node:assert/strict";
import { runTraceBulletCommand } from "../src/cli.ts";

test("investigation command prints a deterministic report for a known Sentry issue", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1001"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /Deterministic Report/);
  assert.match(stdout, /Sentry issue/);
  assert.match(stdout, /SENTRY-TB-1001/);
  assert.match(stdout, /Suspected Causing PR/);
  assert.match(stdout, /#42/);
  assert.match(stdout, /checkout/);
  assert.match(stdout, /Evidence/);
  assert.match(stdout, /Service Match: checkout/);
  assert.match(stdout, /Time Match: merged 5 minutes before first seen/);
  assert.match(stdout, /Other Candidate PRs/);
  assert.match(stdout, /#41/);
  assert.match(stdout, /merged 25 minutes before first seen/);
  assert.match(stdout, /Suggested Revert Command/);
  assert.match(stdout, /git revert f00db42/);
  assert.match(stdout, /Runtime/);
  assert.match(stdout, /source: Local Prototype Data/);
});

test("investigation command prints a machine report when JSON output is requested", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1001",
    "--json"
  ]);

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.sentryIssue.id, "SENTRY-TB-1001");
  assert.equal(machineReport.sentryIssue.serviceTag, "checkout");
  assert.equal(machineReport.suspectedCausingPr.number, 42);
  assert.equal(machineReport.suspectedCausingPr.mergeCommit, "f00db42");
  assert.equal(machineReport.otherCandidatePrs.length, 1);
  assert.equal(machineReport.otherCandidatePrs[0].pullRequest.number, 41);
  assert.equal(machineReport.otherCandidatePrs[0].minutesBeforeFirstSeen, 25);
  assert.equal(machineReport.evidence.serviceMatch, "checkout");
  assert.equal(machineReport.evidence.minutesBeforeFirstSeen, 5);
  assert.equal(machineReport.evidence.slackContext.channel, "#checkout-builds");
  assert.equal(machineReport.runtime.source, "Local Prototype Data");
  assert.equal(machineReport.runtime.investigationWindowMinutes, 30);
});

test("investigation command shows missing Slack Context without failing a valid suspect", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1002"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /Suspected Causing PR/);
  assert.match(stdout, /#51/);
  assert.match(stdout, /Service Match: billing/);
  assert.match(stdout, /Time Match: merged 12 minutes before first seen/);
  assert.match(stdout, /Slack Context: missing/);
});

test("machine report excludes Slack Context without a pre-incident Slack Marker", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1002",
    "--json"
  ]);

  assert.equal(result.exitCode, 0);

  const machineReport = JSON.parse(result.stdout);

  assert.equal(machineReport.suspectedCausingPr.number, 51);
  assert.equal(machineReport.evidence.serviceMatch, "billing");
  assert.equal(machineReport.evidence.minutesBeforeFirstSeen, 12);
  assert.equal(Object.hasOwn(machineReport.evidence, "slackContext"), false);
});

test("investigation command reports no suspect when only Time Match exists", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1003"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /No Suspected Causing PR Found/);
  assert.doesNotMatch(stdout, /Suspected Causing PR\n- PR:/);
  assert.match(stdout, /Missing Proof/);
  assert.match(stdout, /Service Match: missing/);
  assert.match(stdout, /Time Match: present/);
});

test("investigation command reports no suspect when only Service Match exists", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1004"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /No Suspected Causing PR Found/);
  assert.doesNotMatch(stdout, /Suspected Causing PR\n- PR:/);
  assert.match(stdout, /Missing Proof/);
  assert.match(stdout, /Service Match: present/);
  assert.match(stdout, /Time Match: missing/);
});

test("investigation command reports no suspect when neither required match exists", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1005"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /No Suspected Causing PR Found/);
  assert.doesNotMatch(stdout, /Suspected Causing PR\n- PR:/);
  assert.match(stdout, /Missing Proof/);
  assert.match(stdout, /Service Match: missing/);
  assert.match(stdout, /Time Match: missing/);
});

test("investigation command marks Suggested Revert Command unavailable when commit information is missing", async () => {
  const result = runTraceBulletCommand([
    "investigate",
    "SENTRY-TB-1006"
  ]);
  const stdout = result.stdout;

  assert.equal(result.exitCode, 0);
  assert.match(stdout, /Suspected Causing PR/);
  assert.match(stdout, /#61/);
  assert.match(stdout, /Suggested Revert Command/);
  assert.match(stdout, /unavailable: missing merge commit/);
  assert.doesNotMatch(stdout, /git revert\s*$/);
});
