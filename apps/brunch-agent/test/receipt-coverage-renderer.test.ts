import { expect, test } from "vitest";

import { renderCoverage } from "../src/agents/chat-agent/guidance/receipt/coverage-renderer.ts";

import type { LedgerCoverage } from "@hashintel/brunch-agent";

const need = (name: string) => ({
  need: { name, description: `its ${name}`, covers: "quantities" },
  state: "missing" as const,
});

const coverage = (overrides: Partial<LedgerCoverage> = {}): LedgerCoverage => ({
  dimensions: [],
  placeholders: [],
  identities: [
    { identity: "loader", kind: "resource", stage: "confirmed" },
    { identity: "packing", kind: "activity", stage: "confirmed" },
    { identity: "fill-rate", kind: "goal", stage: "confirmed" },
    { identity: "picking", kind: "activity", stage: "confirmed" },
  ],
  relationships: [
    {
      from: "picking",
      relation: "measures",
      to: "fill-rate",
      stage: "confirmed",
    },
    { from: "packing", relation: "follows", to: "picking", stage: "pencilled" },
  ],
  needs: [
    { identity: "loader", kind: "resource", unmet: [need("capacity")] },
    {
      identity: "packing",
      kind: "activity",
      unmet: [need("duration"), need("capacity")],
    },
    { identity: "fill-rate", kind: "goal", unmet: [need("target")] },
    {
      identity: "picking",
      kind: "activity",
      unmet: [{ ...need("duration"), state: "pencilled" }, need("capacity")],
    },
  ],
  ...overrides,
});

test("the receipt ranks needs by distance from a goal and shows the first five", () => {
  expect(renderCoverage.receipt(coverage()).split("\n").slice(1)).toEqual([
    "Missing needs, nearest a goal first (5 of 6):",
    "1. `fill-rate` [goal]: target — its target",
    "2. `picking` [activity], 1 step from `fill-rate`: capacity — its capacity",
    "3. `picking` [activity], 1 step from `fill-rate`: duration (pencilled) — its duration",
    "4. `packing` [activity], 2 steps from `fill-rate`: duration — its duration",
    "5. `packing` [activity], 2 steps from `fill-rate`: capacity — its capacity",
    "1 more across 1 identity; ledger_compile lists them all.",
  ]);
});

test("the map lists every need in the same order", () => {
  expect(renderCoverage.map(coverage()).at(-1)).toBe(
    "6. `loader` [resource], not connected to a goal: capacity — its capacity",
  );
});

test("without a goal the needs keep Ledger order", () => {
  const lines = renderCoverage
    .receipt(
      coverage({
        identities: coverage().identities.slice(0, 2),
        needs: coverage().needs?.slice(0, 2),
      }),
    )
    .split("\n");
  expect(lines.slice(1, 3)).toEqual([
    "Missing needs, no goal identified yet, so in Ledger order:",
    "1. `loader` [resource], not connected to a goal: capacity — its capacity",
  ]);
});
