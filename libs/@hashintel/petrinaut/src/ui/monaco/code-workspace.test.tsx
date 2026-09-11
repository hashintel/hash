/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import { productionMachines } from "@hashintel/petrinaut-core/examples";

import { ActiveNetContext } from "../../react/state/active-net-context";
import { EditorContext } from "../../react/state/editor-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import {
  defaultUserSettingsContextValue,
  UserSettingsContext,
} from "../../react/state/user-settings-context";
import { CodeWorkspaceProvider, useCodeWorkspace } from "./code-workspace";
import { getCodeEntries } from "./code-workspace/entries";

import type { CodeEditorPlacement } from "../../react/state/user-settings-context";

const mutations = vi.hoisted(() => ({
  updatePlace: vi.fn(),
  updateTransition: vi.fn(),
  updateDifferentialEquation: vi.fn(),
}));
vi.mock("../../react", () => ({ usePetrinautMutations: () => mutations }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const definition = productionMachines.petriNetDefinition;
const net = {
  ...definition,
  componentInstances: definition.componentInstances ?? [],
};
const selectItem = vi.fn();

const Probe = () => {
  const workspace = useCodeWorkspace();
  const settings = use(UserSettingsContext);
  return (
    <>
      <output data-testid="active">{workspace.activePath ?? "closed"}</output>
      <output data-testid="placement">{settings.codeEditorPlacement}</output>
      <button
        type="button"
        onClick={() => settings.setEnableCodeEditorWorkspace(false)}
      >
        Disable
      </button>
      <button
        type="button"
        onClick={() => settings.setCodeEditorPlacement("properties")}
      >
        Change layout
      </button>
      <button type="button" onClick={workspace.close}>
        Close
      </button>
      {workspace.entries.map((entry) => (
        <button
          type="button"
          key={entry.path}
          onClick={() => workspace.open(entry.path, "bottom")}
        >
          {entry.owner} / {entry.label}
        </button>
      ))}
    </>
  );
};

const Harness = ({
  documentId = "one",
  empty = false,
  enabled = true,
}: {
  documentId?: string;
  empty?: boolean;
  enabled?: boolean;
}) => {
  const defaults = use(SDCPNContext);
  const editorDefaults = use(EditorContext);
  const [featureEnabled, setFeatureEnabled] = useState(enabled);
  const [placement, setPlacement] = useState<CodeEditorPlacement>("fullscreen");
  const activeNet = empty
    ? { ...net, transitions: [], differentialEquations: [], places: [] }
    : net;
  return (
    <SDCPNContext
      value={{
        ...defaults,
        petriNetId: documentId,
        petriNetDefinition: definition,
        extensions: DEFAULT_PETRINAUT_EXTENSIONS,
      }}
    >
      <ActiveNetContext
        value={{ activeNet, activeSubnetId: null, setActiveSubnetId: () => {} }}
      >
        <EditorContext value={{ ...editorDefaults, selectItem }}>
          <UserSettingsContext
            value={{
              ...defaultUserSettingsContextValue,
              enableCodeEditorWorkspace: featureEnabled,
              setEnableCodeEditorWorkspace: setFeatureEnabled,
              codeEditorPlacement: placement,
              setCodeEditorPlacement: setPlacement,
            }}
          >
            <CodeWorkspaceProvider>
              <Probe />
            </CodeWorkspaceProvider>
          </UserSettingsContext>
        </EditorContext>
      </ActiveNetContext>
    </SDCPNContext>
  );
};

const firstCodeButton = () =>
  screen
    .getAllByRole("button")
    .find((button) => button.textContent.includes(" / "))!;

describe("code workspace navigation", () => {
  it("opens a function directly, selects its owner, and remembers its layout", () => {
    render(<Harness />);
    fireEvent.click(firstCodeButton());
    expect(screen.getByTestId("active").textContent).not.toBe("closed");
    expect(selectItem).toHaveBeenCalledOnce();
    expect(screen.getByTestId("placement").textContent).toBe("bottom");
    const path = screen.getByTestId("active").textContent;
    fireEvent.click(screen.getByText("Change layout"));
    expect(screen.getByTestId("active").textContent).toBe(path);
    expect(screen.getByTestId("placement").textContent).toBe("properties");
    fireEvent.click(screen.getByText("Close"));
    expect(screen.getByTestId("active").textContent).toBe("closed");
  });

  it("does not open while disabled and closes when the flag is disabled", () => {
    const view = render(<Harness enabled={false} />);
    fireEvent.click(firstCodeButton());
    expect(screen.getByTestId("active").textContent).toBe("closed");
    view.unmount();
    render(<Harness />);
    fireEvent.click(firstCodeButton());
    fireEvent.click(screen.getByText("Disable"));
    expect(screen.getByTestId("active").textContent).toBe("closed");
  });

  it("clears the function when the document changes even with identical entity IDs", () => {
    const view = render(<Harness />);
    fireEvent.click(firstCodeButton());
    view.rerender(<Harness documentId="two" />);
    expect(screen.getByTestId("active").textContent).toBe("closed");
  });

  it("clears the function when its entity disappears", () => {
    const view = render(<Harness />);
    fireEvent.click(firstCodeButton());
    view.rerender(<Harness empty />);
    expect(screen.getByTestId("active").textContent).toBe("closed");
  });
});

describe("code entries", () => {
  it("routes edits to the matching transition and equation", () => {
    const entries = getCodeEntries(
      net,
      definition,
      DEFAULT_PETRINAUT_EXTENSIONS,
      mutations,
    );
    const kernel = entries.find((entry) => entry.label === "Transition kernel");
    expect(kernel).toBeDefined();
    kernel?.update("updated kernel");
    expect(mutations.updateTransition).toHaveBeenCalledWith({
      transitionId: kernel?.selection.id,
      update: { transitionKernelCode: "updated kernel" },
    });
    const equation = entries.find(
      (entry) => entry.ownerKind === "Differential equation",
    );
    expect(equation).toBeDefined();
    equation?.update("updated equation");
    expect(mutations.updateDifferentialEquation).toHaveBeenCalledWith({
      equationId: equation?.selection.id,
      update: { code: "updated equation" },
    });
    expect(new Set(entries.map((entry) => entry.path)).size).toBe(
      entries.length,
    );
  });

  it("excludes disabled transition logic and dynamics", () => {
    const entries = getCodeEntries(
      net,
      definition,
      {
        ...DEFAULT_PETRINAUT_EXTENSIONS,
        colors: false,
        dynamics: false,

        stochasticity: false,
      },
      mutations,
    );
    expect(entries.some((entry) => entry.label === "Transition kernel")).toBe(
      false,
    );
    expect(
      entries.some((entry) => entry.ownerKind === "Differential equation"),
    ).toBe(false);
  });
});
