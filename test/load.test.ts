import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_SNAPSHOT_PATH, SnapshotError, loadDepositLaws, validateSnapshot } from "../src/data/load";
import type { Snapshot } from "../src/data/schema";

const real = (): Snapshot => JSON.parse(readFileSync(DEFAULT_SNAPSHOT_PATH, "utf8"));

/** Runs validateSnapshot and returns the problems it reported. */
function problemsFor(snapshot: unknown): string[] {
  try {
    validateSnapshot(snapshot);
  } catch (error) {
    assert.ok(error instanceof SnapshotError, `expected a SnapshotError, got ${error}`);
    return error.problems;
  }
  assert.fail("expected the snapshot to be rejected");
}

test("the committed snapshot loads all 50 states", () => {
  const data = loadDepositLaws();
  assert.equal(data.byCode.size, 50);
  assert.equal(data.meta.count, 50);
  const nevada = data.byCode.get("NV");
  assert.ok(nevada);
  assert.match(nevada.comparison.returnDeadline, /30 days/);
  assert.equal(nevada.url, "https://propinspect.net/security-deposit-laws/nevada");
});

test('every disclaimer says "this guide", not the website\'s "this page"', () => {
  for (const facts of loadDepositLaws().byCode.values()) {
    assert.match(facts.disclaimer, /^This guide is general information/, facts.stateCode);
    assert.match(facts.disclaimer, /we last reviewed this guide on [A-Z][a-z]+ \d{1,2}, \d{4} against /, facts.stateCode);
    assert.doesNotMatch(facts.disclaimer, /this page/i, facts.stateCode);
  }
});

test("review dates are ISO dates in the snapshot", () => {
  for (const facts of loadDepositLaws().byCode.values()) {
    assert.match(facts.lastReviewed, /^\d{4}-\d{2}-\d{2}$/, facts.stateCode);
  }
  const snapshot = real();
  snapshot.states[0]!.lastReviewed = "September 18, 2026";
  const problems = problemsFor(snapshot);
  assert.ok(problems.some((p) => p.startsWith("states.0.lastReviewed:")), problems.join("; "));
});

test("a snapshot missing a state is rejected and names the state", () => {
  const snapshot = real();
  snapshot.states = snapshot.states.filter((facts) => facts.stateCode !== "NY");
  snapshot.count = snapshot.states.length;
  assert.deepEqual(problemsFor(snapshot), ["missing states: NY"]);
});

test("a jurisdiction outside the covered list is rejected until we decide to cover it", () => {
  const snapshot = real();
  snapshot.states.push({ ...snapshot.states[0]!, state: "District of Columbia", stateCode: "DC", slug: "district-of-columbia" });
  snapshot.count = snapshot.states.length;
  assert.deepEqual(problemsFor(snapshot), ["not covered by this server: DC"]);
});

test("a duplicated state is rejected", () => {
  const snapshot = real();
  snapshot.states[1] = { ...snapshot.states[0]! };
  const problems = problemsFor(snapshot);
  assert.ok(problems.includes(`${snapshot.states[0]!.stateCode} appears more than once`), problems.join("; "));
});

test("a count that disagrees with the states is rejected", () => {
  const snapshot = real();
  snapshot.count = 26;
  assert.deepEqual(problemsFor(snapshot), ["count says 26 but the snapshot has 50 states"]);
});

test("a malformed field is rejected with its path", () => {
  const snapshot = real();
  (snapshot.states[0]!.statute as { url: string }).url = "not a url";
  const problems = problemsFor(snapshot);
  assert.ok(problems.some((p) => p.startsWith("states.0.statute.url:")), problems.join("; "));
});

test("a guide URL outside propinspect.net is rejected", () => {
  const snapshot = real();
  snapshot.states[0]!.url = "https://example.com/nevada";
  const problems = problemsFor(snapshot);
  assert.ok(problems.some((p) => p.startsWith("states.0.url:")), problems.join("; "));
});

test("an unreadable file fails loudly instead of starting empty", () => {
  assert.throws(() => loadDepositLaws("/nonexistent/deposit-laws.json"), SnapshotError);
});
