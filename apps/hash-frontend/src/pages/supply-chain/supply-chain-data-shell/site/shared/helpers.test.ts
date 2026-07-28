import { describe, expect, it } from "vitest";

import { sortPlanningRows } from "./helpers";

import type { PlanningRow } from "./row-types";

const planningRow = (
  label: string,
  periodMaterialValue: number | null,
): PlanningRow =>
  ({
    label,
    periodMaterialValue,
  }) as unknown as PlanningRow;

describe("sortPlanningRows material value", () => {
  const rows = [
    planningRow("missing", null),
    planningRow("high", 500),
    planningRow("low", 100),
  ];

  it("sorts ascending with missing values last", () => {
    expect(
      sortPlanningRows(rows, { key: "materialValue", dir: "asc" }).map(
        (row) => row.label,
      ),
    ).toEqual(["low", "high", "missing"]);
  });

  it("sorts descending with missing values last", () => {
    expect(
      sortPlanningRows(rows, { key: "materialValue", dir: "desc" }).map(
        (row) => row.label,
      ),
    ).toEqual(["high", "low", "missing"]);
  });
});
