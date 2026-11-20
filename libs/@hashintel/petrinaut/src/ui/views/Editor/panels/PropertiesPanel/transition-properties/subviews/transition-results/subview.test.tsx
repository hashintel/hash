/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { generateDefaultTransitionKernelCode } from "@hashintel/petrinaut-core";

import { PetrinautInstanceContext } from "../../../../../../../../react/instance-context";
import { ActiveNetContext } from "../../../../../../../../react/state/active-net-context";
import { SDCPNContext } from "../../../../../../../../react/state/sdcpn-context";
import { ReadOnlyReasonContext } from "../../../../../../../../react/state/use-read-only-reason";
import { TransitionPropertiesContext } from "../../context";
import { ResultsHeaderAction } from "./subview";

import type {
  Color,
  ComponentInstance,
  Petrinaut,
  Place,
  SDCPN,
  Transition,
} from "@hashintel/petrinaut-core";

// The menu's positioner observes its anchor; jsdom has no observer.
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
  vi.clearAllMocks();
});

const item: Color = {
  id: "item",
  name: "Item",
  iconSlug: "circle",
  displayColor: "#3366ff",
  elements: [{ elementId: "mass", name: "mass", type: "real" }],
};
const part: Color = { ...item, id: "part", name: "Part" };

const place = (
  id: string,
  name: string,
  colorId: string | null,
  isPort = false,
): Place => ({ id, name, colorId, dynamicsEnabled: false, isPort, x: 0, y: 0 });

const port = (portPlaceId: string) => ({
  endpoint: {
    kind: "componentPort",
    componentInstanceId: "m1",
    portPlaceId,
  } as const,
});

const assemble: Transition = {
  id: "assemble",
  name: "Assemble",
  inputArcs: [
    { placeId: "buffer", weight: 1, type: "standard" },
    { ...port("in"), weight: 2, type: "standard" },
  ],
  outputArcs: [
    { ...port("out"), weight: 3 },
    { ...port("inner"), weight: 1 },
    { ...port("gone"), weight: 1 },
    { placeId: "untyped", weight: 1 },
    { placeId: "done", weight: 4 },
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
  places: [
    place("buffer", "Buffer", "item"),
    place("untyped", "Untyped", null),
    place("done", "Done", "item"),
  ],
  transitions: [assemble],
  types: [item],
  differentialEquations: [],
  parameters: [],
  components: [
    {
      id: "bench",
      name: "Bench",
      places: [
        place("in", "In", "item", true),
        place("out", "Out", "part", true),
        place("inner", "Inner", "item"),
      ],
      transitions: [],
      types: [part],
      differentialEquations: [],
      parameters: [],
    },
  ],
  componentInstances: [machine],
};

const updateTransition = vi.fn();

const Wrapper = ({ children }: { children: ReactNode }) => (
  <PetrinautInstanceContext
    value={
      {
        mutations: { updateTransition },
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
              types: sdcpn.types,
              logicAvailability: {
                lambda: true,
                predicateLambda: true,
                stochasticLambda: true,
                transitionKernel: true,
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

it("loads a template that names each typed place and port the transition puts tokens in", async () => {
  render(<ResultsHeaderAction />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Load default template" }),
  );

  // Left out: the place without a type, the component's place that is not a
  // port, and the port the component no longer has. Core writes the template
  // from the outputs, so the inputs show in nothing a user sees.
  await waitFor(() =>
    expect(updateTransition).toHaveBeenCalledExactlyOnceWith({
      transitionId: "assemble",
      targetComponentId: null,
      update: {
        transitionKernelCode: generateDefaultTransitionKernelCode(
          [],
          [
            { placeName: "Machine::Out", type: part, weight: 3 },
            { placeName: "Done", type: item, weight: 4 },
          ],
        ),
      },
    }),
  );
});
