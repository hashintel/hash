/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use } from "react";
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
import { PetrinautPresentationProvider } from "../views/shared/presentation-context";
import {
  CodeWorkspacePanel,
  CodeWorkspaceProvider,
  SourceCodeEditor,
  useCodeWorkspace,
} from "./code-workspace";
import { getCodeEntries } from "./code-workspace/entries";

import type { CodeEditorProps } from "./code-editor";
import type { editor } from "monaco-editor";

const mutations = vi.hoisted(() => ({
  updatePlace: vi.fn(),
  updateTransition: vi.fn(),
  updateDifferentialEquation: vi.fn(),
}));
vi.mock("../../react", () => ({ usePetrinautMutations: () => mutations }));
vi.mock("./code-editor", () => ({
  CodeEditor: ({ path, value, options, onChange }: CodeEditorProps) => (
    <textarea
      aria-label={options?.ariaLabel ?? "Property code"}
      data-path={path}
      value={value}
      readOnly={options?.readOnly}
      onChange={(event) =>
        onChange?.(event.target.value, {
          changes: [],
          eol: "\n",
          versionId: 1,
          isUndoing: false,
          isRedoing: false,
          isFlush: false,
          isEolChange: false,
          detailedReasonsChangeLengths: [],
        })
      }
    />
  ),
}));
const retainedModel = {
  dispose: vi.fn(),
  isDisposed: () => false,
  isAttachedToEditor: () => false,
};
const updateSubViewSection = vi.fn();
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
  return (
    <>
      <output data-testid="active">{workspace.activePath ?? "closed"}</output>
      <output data-testid="placement">{workspace.placement}</output>
      <button
        type="button"
        onClick={() => {
          if (workspace.activePath)
            workspace.open(workspace.activePath, "properties");
        }}
      >
        Change layout
      </button>
      <button
        type="button"
        onClick={() =>
          workspace.retainModel(retainedModel as unknown as editor.ITextModel)
        }
      >
        Retain model
      </button>
      <button
        type="button"
        onClick={() => {
          const entry = workspace.entries[0];
          if (entry) workspace.open(entry.path);
        }}
      >
        Open default
      </button>
      <button type="button" onClick={workspace.close}>
        Close
      </button>
      {workspace.entries.slice(0, 1).map((entry) => (
        <SourceCodeEditor
          key={entry.path}
          path={entry.path}
          value={entry.value}
        />
      ))}
      <CodeWorkspacePanel />
      {workspace.entries.map((entry) => (
        <button
          type="button"
          key={entry.path}
          onClick={() => workspace.open(entry.path, "fullscreen")}
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
  profile = "editor",
  subnetId = null,
  sectionHeight,
}: {
  documentId?: string;
  empty?: boolean;
  profile?: "editor" | "preview";
  subnetId?: string | null;
  sectionHeight?: number;
}) => {
  const defaults = use(SDCPNContext);
  const editorDefaults = use(EditorContext);
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
        value={{
          activeNet,
          activeSubnetId: subnetId,
          setActiveSubnetId: () => {},
        }}
      >
        <EditorContext value={{ ...editorDefaults, selectItem }}>
          <UserSettingsContext
            value={{
              ...defaultUserSettingsContextValue,
              updateSubViewSection,
              subViewPanels:
                sectionHeight === undefined
                  ? {}
                  : {
                      "transition-properties": {
                        "transition-firing-time": {
                          collapsed: true,
                          height: sectionHeight,
                        },
                      },
                    },
            }}
          >
            <PetrinautPresentationProvider profile={profile}>
              <CodeWorkspaceProvider>
                <Probe />
              </CodeWorkspaceProvider>
            </PetrinautPresentationProvider>
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
    expect(screen.getByTestId("placement").textContent).toBe("fullscreen");
    const path = screen.getByTestId("active").textContent;
    fireEvent.click(screen.getByText("Change layout"));
    expect(screen.getByTestId("active").textContent).toBe(path);
    expect(screen.getByTestId("placement").textContent).toBe("properties");
    fireEvent.click(screen.getByText("Close"));
    expect(screen.getByTestId("active").textContent).toBe("closed");
  });

  it("keeps source code hidden in the preview presentation", () => {
    const view = render(<Harness profile="preview" />);
    fireEvent.click(firstCodeButton());
    expect(screen.getByTestId("active").textContent).toBe("closed");
    view.rerender(<Harness />);
    fireEvent.click(firstCodeButton());
    view.rerender(<Harness profile="preview" />);
    expect(screen.getByTestId("active").textContent).toBe("closed");
  });

  it("returns to the existing property editor and expands its section", () => {
    render(<Harness />);
    const propertyCode = screen.getByRole("textbox", { name: "Property code" });
    const path = propertyCode.getAttribute("data-path");
    fireEvent.click(screen.getByRole("button", { name: /Full screen/ }));
    expect(screen.queryByRole("textbox", { name: "Property code" })).toBeNull();
    expect(screen.getByRole("region", { name: /code editor$/ })).toBeTruthy();
    expect(screen.getByRole("textbox").getAttribute("data-path")).toBe(path);
    fireEvent.click(screen.getByRole("button", { name: "Back to properties" }));
    expect(screen.queryByRole("region", { name: /code editor$/ })).toBeNull();
    expect(
      screen
        .getByRole("textbox", { name: "Property code" })
        .getAttribute("data-path"),
    ).toBe(path);
    expect(updateSubViewSection).toHaveBeenLastCalledWith(
      "transition-properties",
      "transition-firing-time",
      { collapsed: false },
    );
  });

  it("preserves a saved section height when returning from full screen", () => {
    render(<Harness sectionHeight={420} />);
    fireEvent.click(screen.getByRole("button", { name: /Full screen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back to properties" }));
    expect(updateSubViewSection).toHaveBeenLastCalledWith(
      "transition-properties",
      "transition-firing-time",
      { collapsed: false, height: 420 },
    );
  });

  it("returns a transition kernel to its results section", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Production Success / Transition kernel",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to properties" }));
    expect(updateSubViewSection).toHaveBeenLastCalledWith(
      "transition-properties",
      "transition-results",
      { collapsed: false },
    );
  });

  it("clears the function when changing the active subnet", () => {
    const view = render(<Harness />);
    fireEvent.click(firstCodeButton());
    view.rerender(<Harness subnetId="another-subnet" />);
    expect(screen.getByTestId("active").textContent).toBe("closed");
    fireEvent.click(screen.getByText("Open default"));
    expect(screen.getByTestId("placement").textContent).toBe("properties");
  });

  it("clears the function when the document changes even with identical entity IDs", () => {
    const view = render(<Harness />);
    fireEvent.click(firstCodeButton());
    view.rerender(<Harness documentId="two" />);
    expect(screen.getByTestId("active").textContent).toBe("closed");
    fireEvent.click(screen.getByText("Open default"));
    expect(screen.getByTestId("placement").textContent).toBe("properties");
  });

  it.each([{ documentId: "two" }, { subnetId: "another-subnet" }])(
    "disposes retained models before mounting editors in the next scope (%j)",
    (nextScope) => {
      const view = render(<Harness />);
      fireEvent.click(screen.getByText("Retain model"));
      retainedModel.dispose.mockImplementationOnce(() => {
        expect(screen.queryByRole("textbox")).toBeNull();
      });
      view.rerender(<Harness {...nextScope} />);
      expect(retainedModel.dispose).toHaveBeenCalledOnce();
      expect(
        screen.getByRole("textbox", { name: "Property code" }),
      ).toBeTruthy();
    },
  );

  it("clears the function when its entity disappears", () => {
    const view = render(<Harness />);
    fireEvent.click(firstCodeButton());
    view.rerender(<Harness empty />);
    expect(screen.getByTestId("active").textContent).toBe("closed");
    view.rerender(<Harness />);
    fireEvent.click(screen.getByText("Open default"));
    expect(screen.getByTestId("placement").textContent).toBe("properties");
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
