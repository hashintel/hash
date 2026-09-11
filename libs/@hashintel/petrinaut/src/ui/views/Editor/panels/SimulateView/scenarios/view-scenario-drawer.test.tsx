/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  perPlaceMigrationNote,
  ViewScenarioDrawer,
} from "./view-scenario-drawer";

import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { Scenario, SDCPN } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

const mutations = vi.hoisted(() => ({
  addScenario: vi.fn(),
  updateScenario: vi.fn(),
}));
vi.mock("../../../../../../react", () => ({
  usePetrinautMutations: () => mutations,
}));

// Monaco cannot run in jsdom: the expression editor becomes a plain textarea
// and the read-only code slot a block of text.
vi.mock("../../../../../monaco/code-editor", () => ({
  CodeEditor: ({
    onChange,
    options,
    value,
  }: {
    onChange?: (value: string | undefined) => void;
    options?: { readOnly?: boolean };
    value?: string;
  }) =>
    options?.readOnly ? (
      <pre aria-label="Code">{value}</pre>
    ) : (
      <textarea
        aria-label="Expression"
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
      />
    ),
}));

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  // The real Drawer portals its body somewhere testing-library cannot reach
  // from this tree; the parts under test are plain children of it.
  const Drawer = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Header: ({ title }: { title: string }) => <h2>{title}</h2>,
      Body: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Footer: ({
        actions,
        secondaryActions,
      }: {
        actions?: ReactNode;
        secondaryActions?: ReactNode;
      }) => (
        <div>
          {secondaryActions}
          {actions}
        </div>
      ),
    },
  );
  // The real Select is an Ark menu jsdom cannot drive; a native select with
  // the same items stands in for the Variable type picker.
  const Select = ({
    items,
    onChange,
    value,
  }: {
    items: readonly { value: string; text: string }[];
    onChange: (value: string) => void;
    value: string;
  }) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.text}
        </option>
      ))}
    </select>
  );
  return { ...actual, Drawer, Select };
});

// jsdom provides neither observer; the scroll fades and the value editor's
// popover construct both.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): never[] {
    return [];
  }
}
globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver =
  ObserverStub as unknown as typeof IntersectionObserver;
Element.prototype.scrollTo = () => {};

afterEach(cleanup);
beforeEach(() => {
  mutations.updateScenario.mockReset();
});

const adHocScenario: Scenario = {
  id: "scenario-adhoc",
  name: "Inline rush",
  scenarioParameters: [
    { type: "integer", identifier: "base_load", default: 6 },
  ],
  parameterOverrides: {},
  initialState: {
    type: "adhoc",
    content: {
      variables: [
        {
          name: "baseLoad",
          type: "integer",
          expression: "6",
          optimize: null,
          exposed: true,
        },
      ],
      netParameters: [],
      places: {
        "place-queue": {
          kind: "uncoloured",
          count: { expression: "scenario.baseLoad", optimize: null },
        },
      },
    },
  },
};

const perPlaceScenario: Scenario = {
  id: "scenario-per-place",
  name: "Morning rush",
  scenarioParameters: [{ type: "real", identifier: "rate", default: 10 }],
  parameterOverrides: { "param-rate": "scenario.rate * 2" },
  initialState: {
    type: "per_place",
    content: { "place-queue": "scenario.rate" },
  },
};

const codeBody =
  "return { Queue: range(scenario.number_of_satellites).map(() => ({})) };";

const codeScenario: Scenario = {
  id: "scenario-code",
  name: "Pre-deployed",
  description: "Satellites already in orbit",
  scenarioParameters: [
    { type: "integer", identifier: "number_of_satellites", default: 8 },
  ],
  parameterOverrides: {},
  initialState: { type: "code", content: codeBody },
};

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
  ],
  transitions: [],
  types: [],
  parameters: [
    {
      id: "param-rate",
      name: "Arrival rate",
      variableName: "arrival_rate",
      type: "real",
      defaultValue: "1.5",
    },
  ],
  differentialEquations: [],
  scenarios: [adHocScenario, perPlaceScenario, codeScenario],
};

const sdcpnContextValue: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "test-net",
  petriNetDefinition: sdcpn,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "Test",
  getItemType: () => null,
};

const renderDrawer = (scenario: Scenario, onClose = () => {}) =>
  render(
    <LanguageClientContext value={DEFAULT_LANGUAGE_CLIENT_CONTEXT}>
      <SDCPNContext value={sdcpnContextValue}>
        <ViewScenarioDrawer open onClose={onClose} scenario={scenario} />
      </SDCPNContext>
    </LanguageClientContext>,
  );

const saveButton = () =>
  screen.getByRole("button", { name: /Save$/ }) as HTMLButtonElement;

const savedUpdate = () => {
  expect(mutations.updateScenario).toHaveBeenCalledTimes(1);
  return mutations.updateScenario.mock.calls[0]?.[0] as {
    scenarioId: string;
    update: Pick<
      Scenario,
      | "name"
      | "description"
      | "scenarioParameters"
      | "parameterOverrides"
      | "initialState"
    >;
  };
};

const editValue = async (name: string, expression: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
  const editor = await screen.findByRole("textbox", { name: "Expression" });
  fireEvent.change(editor, { target: { value: expression } });
};

describe("ViewScenarioDrawer", () => {
  it("seeds a scenario saved from the form with its stored definition", () => {
    renderDrawer(adHocScenario);

    expect(screen.getByText("baseLoad")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Scenario Parameter baseLoad" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByText(perPlaceMigrationNote)).toBe(null);
    expect(screen.queryByLabelText("Code")).toBe(null);
  });

  it("opens a per-place scenario converted and saves it in the form's format", () => {
    const onClose = vi.fn();
    renderDrawer(perPlaceScenario, onClose);

    expect(screen.getByText(perPlaceMigrationNote)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Scenario Parameter rate" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    const { scenarioId, update } = savedUpdate();
    expect(scenarioId).toBe(perPlaceScenario.id);
    expect(update.initialState.type).toBe("adhoc");
    expect(update.scenarioParameters).toEqual([
      { type: "real", identifier: "rate", default: 10 },
    ]);
    expect(Object.keys(update.parameterOverrides)).toEqual(["param-rate"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a code scenario's code read-only and keeps it verbatim on save", async () => {
    renderDrawer(codeScenario);

    expect(screen.getByLabelText("Code").textContent).toBe(codeBody);
    expect(
      screen.getByText(
        /defines its initial state as code, shown here read-only/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Define as code")).toBe(null);
    expect(screen.queryByText("Queue")).toBe(null);

    fireEvent.change(screen.getByLabelText("Scenario name"), {
      target: { value: "Constellation" },
    });
    await editValue("number_of_satellites", "12");
    fireEvent.click(saveButton());

    const { update } = savedUpdate();
    expect(update.name).toBe("Constellation");
    expect(update.description).toBe("Satellites already in orbit");
    expect(update.scenarioParameters).toEqual([
      { type: "integer", identifier: "number_of_satellites", default: 12 },
    ]);
    expect(update.initialState).toEqual(codeScenario.initialState);
  });

  it("refuses to save a code scenario whose code would read a missing parameter", () => {
    renderDrawer(codeScenario);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Name of variable 1 (Top-level variables)",
      }),
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Name of variable 1 (Top-level variables)",
      }),
      { target: { value: "satellites" } },
    );

    expect(saveButton().disabled).toBe(true);
    expect(
      screen.getByText(
        'Variable "number_of_satellites" is read by the scenario\'s code as scenario.number_of_satellites; keep it exposed with that name and type.',
      ),
    ).toBeTruthy();
    fireEvent.click(saveButton());
    expect(mutations.updateScenario).not.toHaveBeenCalled();
  });

  it("changes nothing on Close", () => {
    const onClose = vi.fn();
    renderDrawer(perPlaceScenario, onClose);

    fireEvent.click(screen.getByRole("button", { name: /Close$/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mutations.updateScenario).not.toHaveBeenCalled();
  });
});
