import { describe, expect, it } from "vitest";

import {
  probabilisticSatellitesSDCPN,
  supplyChainWithDisruption,
} from "../examples";
import { compileHirArtifacts } from "./compile";

const shapesOf = (
  definition: typeof probabilisticSatellitesSDCPN.petriNetDefinition,
) => {
  const { artifacts, failures } = compileHirArtifacts(definition);
  expect(failures).toEqual([]);
  return new Map(
    (definition.metrics ?? []).map((metric) => [
      metric.name,
      artifacts.metrics[metric.id]?.shape,
    ]),
  );
};

describe("inferMetricShape", () => {
  it("tells counts from attributes that follow dynamics", () => {
    const shapes = shapesOf(probabilisticSatellitesSDCPN.petriNetDefinition);
    expect(shapes.get("Satellites in orbit")).toBe("discrete");
    expect(shapes.get("Debris objects")).toBe("discrete");
    expect(shapes.get("Average orbital radius")).toBe("continuous");
    expect(shapes.get("Average orbital speed")).toBe("continuous");
  });

  it("keeps a metric over counts discrete whatever it computes from them", () => {
    const shapes = shapesOf(supplyChainWithDisruption.petriNetDefinition);
    expect(shapes.get("Factory available")).toBe("discrete");
    expect(shapes.get("Inbound pipeline")).toBe("discrete");
    expect(shapes.get("Average inbound risk")).toBe("continuous");
    expect(shapes.get("Average waiting order age")).toBe("continuous");
  });
});
