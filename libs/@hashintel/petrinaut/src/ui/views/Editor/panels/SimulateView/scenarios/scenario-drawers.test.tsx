/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../../../../../react/document/sdcpn-context";
import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../../react/lsp/context";
import { CreateScenarioDrawer } from "./create-scenario-drawer";
import { ViewScenarioDrawer } from "./view-scenario-drawer";

import type { SDCPNContextValue } from "../../../../../../react/document/sdcpn-context";
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
  const [actual, { Select }] = await Promise.all([
    importOriginal<typeof import("@hashintel/ds-components")>(),
    import("../shared/ds-control-stubs"),
  ]);
  // The real Select is an Ark menu jsdom cannot drive; a native select with
  // the same items stands in for the Variable type picker.
  return { ...actual, Select };
});

// jsdom implements no scrolling, and an open Select list scrolls itself to
// the selected option.
Element.prototype.scrollTo = () => {};

afterEach(cleanup);
beforeEach(() => {
  mutations.addScenario.mockReset();
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

// The stored definition carries an override for a parameter the net no
// longer has; the form has no row to clear it, so it must be dropped on open.
const staleOverrideScenario: Scenario = {
  id: "scenario-stale",
  name: "Stale override",
  scenarioParameters: [],
  parameterOverrides: { "param-gone": "3" },
  initialState: {
    type: "adhoc",
    content: {
      variables: [],
      netParameters: [
        { parameterId: "param-gone", expression: "3", optimize: null },
      ],
      places: {
        "place-queue": {
          kind: "uncoloured",
          count: { expression: "4", optimize: null },
        },
      },
    },
  },
};

const perPlaceScenario: Scenario = {
  id: "scenario-per-place",
  name: "Morning rush",
  scenarioParameters: [{ type: "real", identifier: "rate", default: 10 }],
  // "param-gone" names a parameter the net no longer has: it ran fine
  // (compilation skips it) and must neither block Save nor survive it.
  parameterOverrides: {
    "param-rate": "scenario.rate * 2",
    "param-gone": "3",
  },
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
  scenarios: [
    adHocScenario,
    staleOverrideScenario,
    perPlaceScenario,
    codeScenario,
  ],
};

const sdcpnContextValue: SDCPNContextValue = {
  petriNetId: "test-net",
  petriNetDefinition: sdcpn,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  getItemType: () => null,
};

const perPlaceMigrationNote =
  "Saving stores this scenario in the form's format.";
const codeScenarioNotice =
  /^This scenario defines its initial state as code, shown here read-only\./;

const inEditor = (panel: ReactNode) => (
  <LanguageClientContext value={DEFAULT_LANGUAGE_CLIENT_CONTEXT}>
    <SDCPNContext value={sdcpnContextValue}>{panel}</SDCPNContext>
  </LanguageClientContext>
);

const viewPanel = (scenario: Scenario, onClose = () => {}) =>
  inEditor(<ViewScenarioDrawer onClose={onClose} scenario={scenario} />);

const renderDrawer = (scenario: Scenario, onClose?: () => void) =>
  render(viewPanel(scenario, onClose));

const renderCreateDrawer = (onClose = () => {}) =>
  render(inEditor(<CreateScenarioDrawer onClose={onClose} />));

const createButton = () =>
  screen.getByRole("button", { name: /Create$/ }) as HTMLButtonElement;

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

describe("CreateScenarioDrawer", () => {
  it("shows the scenario form under the name and description", () => {
    renderCreateDrawer();

    expect(screen.getByText("Create a scenario")).toBeTruthy();
    expect(screen.getByLabelText("Scenario name")).toBeTruthy();
    expect(screen.getByLabelText("Description")).toBeTruthy();
    expect(screen.getByText("Variables")).toBeTruthy();
    expect(screen.getByText("Parameters")).toBeTruthy();
    expect(screen.getByText("Initial state")).toBeTruthy();
    expect(screen.queryByText("Define as code")).toBe(null);
    expect(
      screen.getByRole("checkbox", { name: "Show all places" }),
    ).toBeTruthy();

    // Every top-level Variable carries the Scenario Parameter pill.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add a variable (Top-level variables)",
      }),
    );
    expect(
      screen.getByRole("button", { name: /^Scenario Parameter / }),
    ).toBeTruthy();
  });

  it("enables Create once the name is unique and saves the form's format", () => {
    const onClose = vi.fn();
    renderCreateDrawer(onClose);

    expect(createButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Scenario name"), {
      target: { value: "Morning rush" },
    });
    expect(createButton().disabled).toBe(true);
    expect(
      screen.getAllByText(
        'A scenario named "Morning rush" already exists. Choose a unique name.',
      ).length,
    ).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Scenario name"), {
      target: { value: "Evening lull" },
    });
    expect(createButton().disabled).toBe(false);

    fireEvent.click(createButton());

    expect(mutations.addScenario).toHaveBeenCalledTimes(1);
    const saved = mutations.addScenario.mock.calls[0]?.[0] as Scenario;
    expect(saved.name).toBe("Evening lull");
    expect(saved.initialState.type).toBe("adhoc");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

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

  it("drops a stored override for a parameter the net no longer has and keeps Save enabled", () => {
    renderDrawer(staleOverrideScenario);

    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    const { update } = savedUpdate();
    expect(update.parameterOverrides).toEqual({});
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
    expect(Object.keys(update.parameterOverrides)).toEqual([
      toPetrinautId("param-rate"),
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a code scenario's code read-only and keeps it verbatim on save", async () => {
    renderDrawer(codeScenario);

    expect(screen.getByLabelText("Code").textContent).toBe(codeBody);
    expect(screen.getByText(codeScenarioNotice)).toBeTruthy();
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

it("keeps the panel shell when selecting another scenario and resets only its form", () => {
  const { rerender } = renderDrawer(adHocScenario);
  const panel = screen.getByRole("region", { name: adHocScenario.name });
  const header = screen.getByRole("heading", { name: adHocScenario.name });
  const input = screen.getByRole("textbox", { name: "Scenario name" });
  fireEvent.change(input, { target: { value: "Unsaved change" } });
  rerender(viewPanel(perPlaceScenario));
  expect(screen.getByRole("region", { name: perPlaceScenario.name })).toBe(
    panel,
  );
  expect(screen.getByRole("heading", { name: perPlaceScenario.name })).toBe(
    header,
  );
  expect(screen.getByRole("textbox", { name: "Scenario name" })).not.toBe(
    input,
  );
  expect(screen.getByRole("textbox", { name: "Scenario name" })).toHaveProperty(
    "value",
    perPlaceScenario.name,
  );
});
