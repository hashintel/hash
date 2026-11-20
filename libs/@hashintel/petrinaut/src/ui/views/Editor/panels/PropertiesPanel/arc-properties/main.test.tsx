/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateArcId, getArcEndpointKey } from "@hashintel/petrinaut-core";

import { PetrinautInstanceContext } from "../../../../../../react/instance-context";
import { ArcProperties } from "./main";

import type {
  ArcEndpoint,
  Petrinaut,
  Place,
  SDCPN,
} from "@hashintel/petrinaut-core";

// The panel's sections measure themselves; jsdom has no observer.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const place = (id: string, name: string): Place => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});

const port = (
  componentInstanceId: string,
  portPlaceId: string,
): ArcEndpoint => ({
  kind: "componentPort",
  componentInstanceId,
  portPlaceId,
});

const sdcpn: SDCPN = {
  places: [place("buffer", "Buffer")],
  transitions: [
    {
      id: "assemble",
      name: "Assemble",
      inputArcs: [{ placeId: "buffer", weight: 2, type: "read" }],
      outputArcs: [{ endpoint: port("m1", "in"), weight: 3 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
  components: [
    {
      id: "bench",
      name: "Bench",
      places: [{ ...place("in", "In"), isPort: true }],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    },
  ],
  componentInstances: [
    {
      id: "m1",
      name: "Machine",
      component: { id: "bench" },
      parameterValues: {},
      x: 0,
      y: 0,
    },
  ],
};

/** The texts under the panel's Source and Target labels. */
const shownEnds = (inputId: string, outputId: string) => {
  render(
    <PetrinautInstanceContext value={{ mutations: {} } as unknown as Petrinaut}>
      <ArcProperties
        arcId={generateArcId({ inputId, outputId })}
        petriNetDefinition={sdcpn}
        fullSdcpn={sdcpn}
      />
    </PetrinautInstanceContext>,
  );
  const under = (label: string) =>
    screen.getByText(label).closest("div")?.parentElement?.textContent;
  return { source: under("Source"), target: under("Target") };
};

describe("the ends an arc's panel names", () => {
  it("names the place and the transition of an input arc", () => {
    expect(shownEnds("buffer", "assemble")).toEqual({
      source: "SourceBuffer",
      target: "TargetAssemble",
    });
  });

  it("names the instance and the port of an arc to a port", () => {
    expect(shownEnds("assemble", getArcEndpointKey(port("m1", "in")))).toEqual({
      source: "SourceAssemble",
      target: "TargetMachine.In",
    });
  });

  it.each([
    [port("m1", "gone"), "TargetMachine.Unknown port"],
    [port("gone", "in"), "TargetUnknown component.Unknown port"],
  ])("says which part of a port it cannot find", (endpoint, target) => {
    expect(shownEnds("assemble", getArcEndpointKey(endpoint)).target).toBe(
      target,
    );
  });
});
