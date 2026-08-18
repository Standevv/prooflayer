import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readComponent = (name) => readFileSync(new URL(`../components/${name}`, import.meta.url), "utf8");

test("monitoring views present persisted snapshots as historical as-of data", () => {
  const assetMonitor = readComponent("asset-monitor.tsx");
  const overview = readComponent("monitoring-overview.tsx");
  const operatorConsole = readComponent("operator-console.tsx");

  assert.match(assetMonitor, /Most recent as-of snapshot/);
  assert.match(assetMonitor, /Current RVC result is not fetched/);
  assert.match(assetMonitor, /AS-OF RVC/);
  assert.match(assetMonitor, /Earlier vs later persisted snapshot/);

  assert.match(overview, /Historical \/ as-of snapshot data/);
  assert.match(overview, /Current RVC truth is not fetched/);
  assert.match(overview, /AS-OF RVC/);

  assert.match(operatorConsole, /Most recent persisted snapshots/);
  assert.match(operatorConsole, /AS-OF history only/);
  assert.match(operatorConsole, /AS-OF RVC/);
  assert.match(operatorConsole, /persisted snapshot recorded/);
});

test("monitoring views do not label persisted history as current truth", () => {
  const source = [
    readComponent("asset-monitor.tsx"),
    readComponent("monitoring-overview.tsx"),
    readComponent("operator-console.tsx"),
  ].join("\n");

  for (const misleadingCopy of [
    "Current trust state",
    "Latest deterministic snapshot",
    "Previous vs current",
    "Current lifecycle state",
    "Latest trust snapshots",
    "RVC reports MISSING_EVIDENCE",
  ]) {
    assert.doesNotMatch(source, new RegExp(misleadingCopy), misleadingCopy);
  }
});
