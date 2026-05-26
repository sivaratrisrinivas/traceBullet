import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("implementation docs preserve the accepted prototype direction for later dashboard work", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /Accepted prototype direction/);
  assert.match(readme, /prototypes\/tracebullet-app-prototype\/NOTES\.md/);
  assert.match(readme, /dashboard is not part of the first implementation/);
  assert.match(readme, /one-action-per-screen instrument/);

  assert.match(readme, /Sentry Issue ID[\s\S]*choose/i);
  assert.match(readme, /Suspected Causing PR[\s\S]*read/i);
  assert.match(readme, /Evidence[\s\S]*check/i);
  assert.match(readme, /Suggested Revert Command[\s\S]*copy/i);
  assert.match(readme, /Machine Report[\s\S]*inspect/i);
});
