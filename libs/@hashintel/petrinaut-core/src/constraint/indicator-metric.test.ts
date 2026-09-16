import { describe, expect, it } from "vitest";

import { instantiateHirMetric } from "../hir/instantiate";
import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import { StringPool } from "../simulation/engine/string-pool";
import {
  compileStateConstraintIndicator,
  wrapHirAsIndicator,
} from "./indicator-metric";
import { lowerConstraint } from "./lower";

import type { HirFunction } from "../hir/hir";
import type { SDCPN } from "../types/sdcpn";
import type { StateConstraint } from "./constraint";

const sdcpn: SDCPN = {
  places: [
    {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "place-done",
      name: "Done",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const lowerState = (code: string): StateConstraint => {
  const result = lowerConstraint(
    { space: "state", id: "queue-cap", code },
    { netParameters: [], scenarioParameters: [], sdcpn },
  );
  if (!result.ok || result.constraint.space !== "state") {
    throw new Error(result.ok ? "wrong space" : result.diagnostics[0]?.message);
  }
  return result.constraint;
};

/** Runs an emitted indicator against a frame holding only place counts. */
const evaluateAt = (
  artifact: NonNullable<ReturnType<typeof compileStateConstraintIndicator>>,
  countsByName: Record<string, number>,
): number => {
  const frameOrder = ["Done", "Queue"];
  const placeIndices = new Int32Array(
    artifact.placeNames.map((name) => frameOrder.indexOf(name)),
  );
  const metric = instantiateHirMetric(
    artifact.source,
    {},
    placeIndices,
    new StringPool(),
  );
  const placeCounts = new Uint32Array(
    frameOrder.map((name) => countsByName[name] ?? 0),
  );
  return metric(
    new Float64Array(0),
    new BigUint64Array(0),
    new Uint8Array(0),
    placeCounts,
    new Uint32Array(frameOrder.length),
  );
};

describe("wrapHirAsIndicator", () => {
  it("wraps the body as `body ? 1 : 0` with fresh node ids", () => {
    const lowered = lowerTypeScriptToHir("return true;", "metric");
    if (!lowered.ok) {
      throw new Error(lowered.diagnostics[0]?.message);
    }
    const fn: HirFunction = lowered.fn;
    const wrapped = wrapHirAsIndicator(fn);
    expect(wrapped.params).toEqual(fn.params);
    expect(wrapped.body).toMatchObject({
      kind: "cond",
      condition: fn.body,
      thenBranch: { kind: "numberLit", value: 1 },
      elseBranch: { kind: "numberLit", value: 0 },
    });
    const ids = new Set<number>();
    const collect = (node: { id: number }) => ids.add(node.id);
    collect(wrapped.body);
    if (wrapped.body.kind === "cond") {
      collect(wrapped.body.thenBranch);
      collect(wrapped.body.elseBranch);
      collect(wrapped.body.condition);
    }
    expect(ids.size).toBe(4);
  });
});

describe("compileStateConstraintIndicator", () => {
  it("emits a program that reads 1 where the condition holds and 0 where it fails", () => {
    const artifact = compileStateConstraintIndicator(
      lowerState("return state.places.Queue.count <= 10;"),
      sdcpn,
    );
    expect(artifact).not.toBeNull();
    expect(evaluateAt(artifact!, { Queue: 4 })).toBe(1);
    expect(evaluateAt(artifact!, { Queue: 10 })).toBe(1);
    expect(evaluateAt(artifact!, { Queue: 11 })).toBe(0);
  });

  it("compiles compound conditions over several places", () => {
    const artifact = compileStateConstraintIndicator(
      lowerState(
        "return state.places.Queue.count < 5 && state.places.Done.count > 0;",
      ),
      sdcpn,
    );
    expect(artifact).not.toBeNull();
    expect(evaluateAt(artifact!, { Queue: 2, Done: 1 })).toBe(1);
    expect(evaluateAt(artifact!, { Queue: 2, Done: 0 })).toBe(0);
    expect(evaluateAt(artifact!, { Queue: 7, Done: 3 })).toBe(0);
  });
});
