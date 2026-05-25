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
  assert.match(stdout, /Runtime/);
  assert.match(stdout, /source: Local Prototype Data/);
});
