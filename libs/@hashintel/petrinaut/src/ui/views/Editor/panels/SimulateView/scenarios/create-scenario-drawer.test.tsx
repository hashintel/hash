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
import { CreateScenarioDrawer } from "./create-scenario-drawer";

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

// Monaco cannot run in jsdom; the expression editor becomes a plain textarea.
vi.mock("../../../../../monaco/code-editor", () => ({
  CodeEditor: ({
    onChange,
    value,
  }: {
    onChange: (value: string | undefined) => void;
    value?: string;
  }) => (
    <textarea
      aria-label="Expression"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
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
      Header: ({
        title,
        description,
      }: {
        title: string;
        description?: string;
      }) => (
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      ),
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
  mutations.addScenario.mockReset();
});

const existingScenario: Scenario = {
  id: "scenario-existing",
  name: "Morning rush",
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
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
  scenarios: [existingScenario],
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

const renderDrawer = (onClose = () => {}) =>
  render(
    <LanguageClientContext value={DEFAULT_LANGUAGE_CLIENT_CONTEXT}>
      <SDCPNContext value={sdcpnContextValue}>
        <CreateScenarioDrawer open onClose={onClose} />
      </SDCPNContext>
    </LanguageClientContext>,
  );

const createButton = () =>
  screen.getByRole("button", { name: /Create$/ }) as HTMLButtonElement;

describe("CreateScenarioDrawer", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <LanguageClientContext value={DEFAULT_LANGUAGE_CLIENT_CONTEXT}>
        <SDCPNContext value={sdcpnContextValue}>
          <CreateScenarioDrawer open={false} onClose={() => {}} />
        </SDCPNContext>
      </LanguageClientContext>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows the scenario form under the name and description", () => {
    renderDrawer();

    expect(screen.getByText("Create a scenario")).toBeTruthy();
    expect(screen.getByLabelText("Scenario name")).toBeTruthy();
    expect(screen.getByLabelText("Description")).toBeTruthy();
    expect(screen.getByText("Variables")).toBeTruthy();
    expect(screen.getByText("Parameters")).toBeTruthy();
    expect(screen.getByText("Initial state")).toBeTruthy();
    expect(screen.queryByText("Define as code")).toBe(null);
    expect(screen.queryByText("Show all places")).toBe(null);

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
    renderDrawer(onClose);

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
