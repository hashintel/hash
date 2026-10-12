import { expect, test } from "vitest";

import { nameOfMetric } from "./describe-draft";

import type { SDCPN } from "@hashintel/petrinaut-core";

test("names a metric by its id when the metric is unnamed or gone", () => {
  const definition = {
    metrics: [{ id: "metric-1", name: "", code: "return 1;" }],
  } as unknown as SDCPN;

  expect(nameOfMetric(definition, "metric-1")).toBe("metric-1");
  expect(nameOfMetric(definition, "metric-2")).toBe("metric-2");
});
