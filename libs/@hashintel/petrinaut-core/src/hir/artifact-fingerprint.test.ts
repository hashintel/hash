import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "../extensions";
import { fingerprintHirCompilationInput } from "./artifact-fingerprint";

import type { SDCPN } from "../types/sdcpn";

const sdcpn: SDCPN = {
  types: [],
  differentialEquations: [],
  parameters: [],
  places: [],
  transitions: [],
  metrics: [{ id: "metric", name: "Metric", code: "return 1;" }],
};

describe("fingerprintHirCompilationInput", () => {
  it("is independent of object key insertion order", () => {
    const reordered = {
      metrics: sdcpn.metrics,
      transitions: sdcpn.transitions,
      places: sdcpn.places,
      parameters: sdcpn.parameters,
      differentialEquations: sdcpn.differentialEquations,
      types: sdcpn.types,
    } satisfies SDCPN;

    expect(
      fingerprintHirCompilationInput(sdcpn, DEFAULT_PETRINAUT_EXTENSIONS),
    ).toBe(
      fingerprintHirCompilationInput(reordered, DEFAULT_PETRINAUT_EXTENSIONS),
    );
  });

  it("changes when compiled user code changes", () => {
    const changed: SDCPN = {
      ...sdcpn,
      metrics: [{ ...sdcpn.metrics![0]!, code: "return 2;" }],
    };

    expect(
      fingerprintHirCompilationInput(sdcpn, DEFAULT_PETRINAUT_EXTENSIONS),
    ).not.toBe(
      fingerprintHirCompilationInput(changed, DEFAULT_PETRINAUT_EXTENSIONS),
    );
  });
});
