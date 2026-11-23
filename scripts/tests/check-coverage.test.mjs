import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { evaluate, main, renderTable } from "../check-coverage.mjs";

const thresholds = { thresholds: { web: { statements: 60, branches: 60, functions: 50, lines: 60 } } };
const webSummary = (n) => ({ total: Object.fromEntries(["statements", "branches", "functions", "lines"].map((k) => [k, { pct: n }])) });

describe(".coverage-thresholds.json", () => {
  const committed = JSON.parse(readFileSync(".coverage-thresholds.json", "utf8"));

  it("has a rationale and thresholds for the web component", () => {
    assert.ok(committed.rationale.length > 50);
    assert.deepEqual(Object.keys(committed.thresholds.web).sort(), ["branches", "functions", "lines", "statements"]);
  });
});

describe("evaluate", () => {
  it("passes when every web metric meets its threshold", () => {
    assert.ok(evaluate("web", thresholds, webSummary(70)).every((r) => r.ok));
  });

  it("fails the metric that is below its threshold", () => {
    const rows = evaluate("web", thresholds, webSummary(55));
    assert.equal(rows.find((r) => r.metric === "functions").ok, true);
    assert.equal(rows.find((r) => r.metric === "lines").ok, false);
  });

  it("throws on missing thresholds or a malformed report instead of passing", () => {
    assert.throws(() => evaluate("rust", thresholds, {}), /no thresholds/);
    assert.throws(() => evaluate("web", thresholds, {}), /no total/);
  });

  for (const bad of [
    ["null", null],
    ["numeric string", "60"],
    ["zero", 0],
    ["negative", -5],
    ["greater than 100", 150],
    ["non-finite number", Number.POSITIVE_INFINITY],
  ]) {
    it(`rejects a ${bad[0]} web threshold instead of comparing it`, () => {
      for (const metric of ["statements", "branches", "functions", "lines"]) {
        const broken = { thresholds: { web: { statements: 88, branches: 83, functions: 86, lines: 89, [metric]: bad[1] } } };
        assert.throws(() => evaluate("web", broken, webSummary(70)), new RegExp(`web threshold ${metric}`));
      }
    });
  }

  it("still accepts the current committed thresholds", () => {
    assert.ok(evaluate("web", thresholds, webSummary(70)).every((r) => r.ok));
  });
});

describe("main", () => {
  const files = {
    t: JSON.stringify(thresholds),
    ok: JSON.stringify(webSummary(70)),
    low: JSON.stringify(webSummary(10)),
  };
  const reader = (p) => files[p];
  const run = (summary) => {
    const original = process.stdout.write;
    process.stdout.write = () => true;
    try {
      return main(["--component", "web", "--summary", summary, "--thresholds", "t"], reader);
    } finally {
      process.stdout.write = original;
    }
  };

  it("exits 0 above the thresholds and 1 below them", () => {
    assert.equal(run("ok"), 0);
    assert.equal(run("low"), 1);
  });

  it("renders a table with a status column", () => {
    assert.ok(renderTable("web", evaluate("web", thresholds, webSummary(10))).includes("FAIL"));
  });
});
