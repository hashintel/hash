/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetrinautInstanceContext } from "../../../../../../../react/instance-context";
import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { ReadOnlyReasonContext } from "../../../../../../../react/state/use-read-only-reason";
import { TransitionPropertiesContext } from "../context";
import { TransitionMainContent } from "./main";

import type {
  ComponentInstance,
  Petrinaut,
  Place,
  SDCPN,
  Transition,
} from "@hashintel/petrinaut-core";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const place = (id: string, name: string, isPort = false): Place => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  isPort,
  x: 0,
  y: 0,
});

const machineIn = {
  kind: "componentPort",
  componentInstanceId: "m1",
  portPlaceId: "in",
} as const;
const machineGone = {
  kind: "componentPort",
  componentInstanceId: "m1",
  portPlaceId: "gone",
} as const;

const assemble: Transition = {
  id: "assemble",
  name: "Assemble",
  inputArcs: [
    { placeId: "buffer", weight: 1, type: "standard" },
    { endpoint: machineIn, weight: 2, type: "standard" },
  ],
  outputArcs: [
    { placeId: "done", weight: 3 },
    { endpoint: machineGone, weight: 4 },
  ],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
};

const machine: ComponentInstance = {
  id: "m1",
  name: "Machine",
  component: { id: "bench" },
  parameterValues: {},
  x: 0,
  y: 0,
};

const sdcpn: SDCPN = {
  places: [place("buffer", "Buffer"), place("done", "Done")],
  transitions: [assemble],
  types: [],
  differentialEquations: [],
  parameters: [],
  components: [
    {
      id: "bench",
      name: "Bench",
      places: [place("in", "In", true)],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    },
  ],
  componentInstances: [machine],
};

const updateArcWeight = vi.fn();
const removeArc = vi.fn();

const Wrapper = ({ children }: { children: ReactNode }) => (
  <PetrinautInstanceContext
    value={
      {
        mutations: { updateArcWeight, removeArc },
        mutationRefusal: () => null,
      } as unknown as Petrinaut
    }
  >
    <ReadOnlyReasonContext value={null}>
      <SDCPNContext value={{ ...use(SDCPNContext), petriNetDefinition: sdcpn }}>
        <ActiveNetContext
          value={{
            ...use(ActiveNetContext),
            activeNet: {
              ...use(ActiveNetContext).activeNet,
              places: sdcpn.places,
              transitions: sdcpn.transitions,
              componentInstances: [machine],
            },
          }}
        >
          <TransitionPropertiesContext
            value={{
              transition: assemble,
              types: [],
              logicAvailability: {
                lambda: false,
                predicateLambda: false,
                stochasticLambda: false,
                transitionKernel: false,
              },
            }}
          >
            {children}
          </TransitionPropertiesContext>
        </ActiveNetContext>
      </SDCPNContext>
    </ReadOnlyReasonContext>
  </PetrinautInstanceContext>
);

const deleteButtons = () =>
  screen.getAllByRole("button", { name: "Delete arc" });
const weights = () => screen.getAllByRole<HTMLInputElement>("spinbutton");

describe("the arcs of a transition", () => {
  it("lists the input arcs, then the output arcs, by the name of what each touches", () => {
    render(<TransitionMainContent />, { wrapper: Wrapper });
    const rows = deleteButtons().map(
      (button) =>
        button.closest("[data-arc-delete]")?.parentElement?.textContent,
    );
    expect(rows).toEqual([
      expect.stringContaining("Buffer"),
      expect.stringContaining("Machine.In"),
      expect.stringContaining("Done"),
      expect.stringContaining("Machine.Unknown port"),
    ]);
    expect(weights().map((input) => input.value)).toEqual(["1", "2", "3", "4"]);
  });

  it("removes an arc on the side it is listed under", () => {
    render(<TransitionMainContent />, { wrapper: Wrapper });
    fireEvent.click(deleteButtons()[1]!);
    expect(removeArc).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transitionId: "assemble",
        arcDirection: "input",
        endpoint: machineIn,
      }),
    );
    fireEvent.click(deleteButtons()[2]!);
    expect(removeArc).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transitionId: "assemble",
        arcDirection: "output",
        endpoint: { kind: "place", placeId: "done" },
      }),
    );
  });

  it("changes the weight of an arc on the side it is listed under", () => {
    render(<TransitionMainContent />, { wrapper: Wrapper });
    fireEvent.change(weights()[0]!, { target: { value: "5" } });
    fireEvent.blur(weights()[0]!);
    expect(updateArcWeight).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transitionId: "assemble",
        arcDirection: "input",
        endpoint: { kind: "place", placeId: "buffer" },
        weight: 5,
      }),
    );
    fireEvent.change(weights()[3]!, { target: { value: "6" } });
    fireEvent.blur(weights()[3]!);
    expect(updateArcWeight).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transitionId: "assemble",
        arcDirection: "output",
        endpoint: machineGone,
        weight: 6,
      }),
    );
  });
});
