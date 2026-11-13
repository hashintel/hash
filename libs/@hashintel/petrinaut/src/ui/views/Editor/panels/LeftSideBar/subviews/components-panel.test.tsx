/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveLibrary,
  resolvedLibraries,
  type ComponentReference,
  type ImportStates,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { CompositionContext } from "../../../../../../react/state/composition-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  logisticsLibrary,
  missingLibraryId,
  toolingLibrary,
} from "../../../../../libraries-story-fixtures";
import { readDraggedComponent } from "../../../../shared/canvas-node-drag";
import { componentsSubView } from "./components-panel";

afterEach(cleanup);

const conveyor: ComponentReference = {
  from: logisticsLibrary.id,
  id: "conveyor",
};

const setAddComponentMode = vi.fn();
const setEditionMode = vi.fn();
const imports: ImportStates = new Map([
  [
    logisticsLibrary.id,
    {
      status: "resolved",
      library: resolveLibrary(logisticsLibrary.id, logisticsLibrary),
    },
  ],
  [toolingLibrary.id, { status: "resolving" }],
  [missingLibraryId, { status: "failed", message: "The registry is down." }],
]);
const editor = {
  readonly: false,
  armed: null as ComponentReference | null,
  activeSubnetId: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  editor.readonly = false;
  editor.armed = null;
  editor.activeSubnetId = null;
});

const Wrapper = ({ children }: { children: ReactNode }) => (
  <SDCPNContext value={{ ...use(SDCPNContext), readonly: editor.readonly }}>
    <CompositionContext value={{ provided, compositionOnly: false }}>
      <ActiveNetContext
        value={{
          ...use(ActiveNetContext),
          activeSubnetId: editor.activeSubnetId,
        }}
      >
        <EditorContext
          value={{
            ...use(EditorContext),
            editionMode: editor.armed === null ? "cursor" : "add-component",
            componentToAdd: editor.armed,
            setAddComponentMode,
            setEditionMode,
          }}
        >
          {children}
        </EditorContext>
      </ActiveNetContext>
    </CompositionContext>
  </SDCPNContext>
);

const renderPanel = () =>
  render(<componentsSubView.component />, { wrapper: Wrapper });

describe("the Components panel", () => {
  it("lists the components of a library under its name, with what each does", () => {
    renderPanel();

    const group = screen.getByRole("region", { name: "Logistics" });
    expect(
      [...group.querySelectorAll("button")].map((button) => button.textContent),
    ).toEqual([
      "ConveyorMoves what comes in to the other end",
      "StationA step of the line, run by what is bound to it",
    ]);
  });

  it("says where a library on offer stands until it has resolved", () => {
    renderPanel();

    expect(
      screen.getByRole("region", { name: toolingLibrary.id }).textContent,
    ).toBe(`${toolingLibrary.id}Resolving`);
    expect(
      screen.getByRole("region", { name: missingLibraryId }).textContent,
    ).toBe(`${missingLibraryId}The registry is down.`);
  });

  it("arms a component for the next click on the canvas, and lets go of it", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Conveyor/ }));

    expect(setAddComponentMode).toHaveBeenCalledExactlyOnceWith(conveyor);

    cleanup();
    editor.armed = conveyor;
    renderPanel();
    const armed = screen.getByRole("button", { name: /Conveyor/ });
    expect(armed.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /Station/ })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.click(armed);

    expect(setEditionMode).toHaveBeenCalledExactlyOnceWith("cursor");
  });

  it("hands the canvas the component a drag carries", () => {
    renderPanel();
    const payload = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      setData: (type: string, value: string) => payload.set(type, value),
      getData: (type: string) => payload.get(type) ?? "",
    } as unknown as DataTransfer;

    fireEvent.dragStart(screen.getByRole("button", { name: /Station/ }), {
      dataTransfer,
    });

    expect(readDraggedComponent(dataTransfer)).toEqual({
      from: logisticsLibrary.id,
      id: "station",
    });
  });

  it.each([
    ["while the net is read-only", { readonly: true }],
    ["inside a subnet", { activeSubnetId: "stage" }],
  ])("offers nothing to place %s", (_when, state) => {
    Object.assign(editor, state);
    renderPanel();

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveProperty("disabled", true);
      expect(button.getAttribute("draggable")).toBe("false");
    }
  });
});
