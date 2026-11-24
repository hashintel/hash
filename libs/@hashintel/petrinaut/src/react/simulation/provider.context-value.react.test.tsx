/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as core from "@hashintel/petrinaut-core";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  cafeQueue,
  supplyChainProfit,
} from "@hashintel/petrinaut-core/examples";
import { lowerScenarioToHir } from "@hashintel/petrinaut-core/hir";

import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../document/sdcpn-context";
import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
  type LanguageClientContextValue,
} from "../lsp/context";
import { PetrinautNavigationProvider } from "../navigation/navigation-provider";
import { SimulationContext, type SimulationContextValue } from "./context";
import { SimulationProvider } from "./provider";

vi.mock("@hashintel/petrinaut-core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/petrinaut-core")>();
  return {
    ...actual,
    compileScenario: vi.fn(actual.compileScenario),
    synthesizeAdHocScenario: vi.fn(actual.synthesizeAdHocScenario),
  };
});

const compileScenario = vi.mocked(core.compileScenario);
const synthesizeAdHocScenario = vi.mocked(core.synthesizeAdHocScenario);

// Lowers for real, inline where the editor asks a worker, so the provider
// has a scenario to compile.
const languageClient: LanguageClientContextValue = {
  ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  requestScenarioHir: (scenario, adHocContext) =>
    Promise.resolve(lowerScenarioToHir(scenario, { adHocContext })),
};

const Reader = ({
  onValue,
}: {
  onValue: (value: SimulationContextValue) => void;
}) => {
  onValue(use(SimulationContext));
  return null;
};

const Parent = ({
  petriNetDefinition,
  onValue,
}: {
  petriNetDefinition: SDCPN;
  onValue: (value: SimulationContextValue) => void;
}) => {
  const [renders, setRenders] = useState(0);
  const [sdcpn, setSdcpn] = useState<SDCPNContextValue>(() => ({
    petriNetId: "test-net",
    petriNetDefinition,
    readonly: false,
    extensions: DEFAULT_PETRINAUT_EXTENSIONS,
    getItemType: () => null,
  }));
  // What moving a transition does to the document: its parameters, places,
  // types and scenarios stay as they were.
  const moveTransition = () =>
    setSdcpn({
      ...sdcpn,
      petriNetDefinition: {
        ...sdcpn.petriNetDefinition,
        transitions: [...sdcpn.petriNetDefinition.transitions],
      },
    });
  return (
    <LanguageClientContext value={languageClient}>
      <SDCPNContext value={sdcpn}>
        <PetrinautNavigationProvider>
          <SimulationProvider>
            <Reader onValue={onValue} />
            <button type="button" onClick={() => setRenders(renders + 1)}>
              Render the parent, {renders}
            </button>
            <button type="button" onClick={moveTransition}>
              Move a transition
            </button>
          </SimulationProvider>
        </PetrinautNavigationProvider>
      </SDCPNContext>
    </LanguageClientContext>
  );
};

/**
 * The provider under a parent that renders again on `renderParent`, with
 * every input of the provider held as it was.
 */
const renderProvider = (petriNetDefinition: SDCPN) => {
  let latest: SimulationContextValue | null = null;
  const view = render(
    <Parent
      petriNetDefinition={petriNetDefinition}
      onValue={(value) => {
        latest = value;
      }}
    />,
  );

  return {
    value: () => latest!,
    renderParent: () =>
      act(() =>
        view.getByRole("button", { name: /Render the parent/ }).click(),
      ),
    moveTransition: () =>
      act(() =>
        view.getByRole("button", { name: "Move a transition" }).click(),
      ),
  };
};

const fieldsThatChanged = (
  before: SimulationContextValue,
  after: SimulationContextValue,
) =>
  (Object.keys(after) as (keyof SimulationContextValue)[]).filter(
    (field) => before[field] !== after[field],
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SimulationProvider context value", () => {
  it("is the same value after a render that changed nothing, with a scenario selected", async () => {
    const { value, renderParent } = renderProvider(
      cafeQueue.petriNetDefinition,
    );
    // The first scenario is the one in effect, and it compiles once lowered.
    await waitFor(() => expect(value().compiledScenarioResult).not.toBeNull());
    const before = value();
    compileScenario.mockClear();

    renderParent();
    renderParent();

    expect(fieldsThatChanged(before, value())).toEqual([]);
    expect(value()).toBe(before);
    expect(compileScenario).not.toHaveBeenCalled();
  });

  it("is the same value after a render that changed nothing, with an ad-hoc scenario", async () => {
    const { value, renderParent } = renderProvider({
      ...supplyChainProfit.petriNetDefinition,
      scenarios: [],
    });
    act(() =>
      value().setAdHocScenario({
        variables: [],
        netParameters: [],
        places: {},
      }),
    );
    await waitFor(() => expect(value().compiledScenarioResult).not.toBeNull());
    const before = value();
    compileScenario.mockClear();
    synthesizeAdHocScenario.mockClear();

    renderParent();
    renderParent();

    expect(fieldsThatChanged(before, value())).toEqual([]);
    expect(value()).toBe(before);
    expect(synthesizeAdHocScenario).not.toHaveBeenCalled();
    expect(compileScenario).not.toHaveBeenCalled();
  });

  it("is the same value after a render that changed nothing, with no scenario at all", () => {
    const { value, renderParent } = renderProvider({
      ...supplyChainProfit.petriNetDefinition,
      scenarios: [],
    });
    const before = value();

    renderParent();

    expect(fieldsThatChanged(before, value())).toEqual([]);
    expect(value()).toBe(before);
  });

  it("is the same value after a document change that touches no parameter, place or type, with a scenario selected", async () => {
    const { value, moveTransition } = renderProvider(
      cafeQueue.petriNetDefinition,
    );
    await waitFor(() => expect(value().compiledScenarioResult).not.toBeNull());
    const before = value();

    moveTransition();

    expect(fieldsThatChanged(before, value())).toEqual([]);
    expect(value()).toBe(before);
  });

  it("is the same value after a document change that touches no parameter, place or type, with no scenario at all", () => {
    const { value, moveTransition } = renderProvider({
      ...supplyChainProfit.petriNetDefinition,
      scenarios: [],
    });
    const before = value();

    moveTransition();

    expect(fieldsThatChanged(before, value())).toEqual([]);
    expect(value()).toBe(before);
  });

  it("is a new value when a parameter is typed, with the scenario compiled against it", async () => {
    const { value } = renderProvider({
      ...supplyChainProfit.petriNetDefinition,
      scenarios: [],
    });
    act(() =>
      value().setAdHocScenario({
        variables: [],
        netParameters: [],
        places: {},
      }),
    );
    await waitFor(() => expect(value().compiledScenarioResult).not.toBeNull());
    const before = value();
    const parameter = supplyChainProfit.petriNetDefinition.parameters[0]!;

    act(() => value().setParameterValue(parameter.variableName, "123"));

    expect(value()).not.toBe(before);
    expect(
      value().adHocNetParameters.find((entry) => entry.id === parameter.id)
        ?.defaultValue,
    ).toBe("123");
    expect(
      value().compiledScenarioResult?.parameterValues[parameter.variableName],
    ).toBe("123");
  });
});
