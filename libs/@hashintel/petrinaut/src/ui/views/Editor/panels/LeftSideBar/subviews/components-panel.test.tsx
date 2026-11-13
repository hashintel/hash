/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  providedComponentSubnetId,
  resolveProvidedComponents,
  type ProvidedComponent,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { CompositionContext } from "../../../../../../react/state/composition-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { readDraggedComponent } from "../../../../shared/canvas-node-drag";
import { componentsSubView } from "./components-panel";

afterEach(cleanup);

const packer: ProvidedComponent = {
  id: "warehouse/packer",
  name: "Packer",
  description: "Packs an order into a parcel",
  ports: [{ name: "Orders", direction: "in" }],
};
const sorter: ProvidedComponent = {
  id: "warehouse/sorter",
  name: "Sorter",
  ports: [{ name: "Orders", direction: "out" }],
};

const setAddComponentMode = vi.fn();
const setEditionMode = vi.fn();
const provided = resolveProvidedComponents([packer, sorter]);
const editor = {
  readonly: false,
  armed: null as string | null,
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
            componentSubnetId: editor.armed,
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
  it("lists what the host provides, with what each does", () => {
    renderPanel();

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["PackerPacks an order into a parcel", "Sorter"]);
  });

  it("arms a component for the next click on the canvas, and lets go of it", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Packer/ }));

    expect(setAddComponentMode).toHaveBeenCalledExactlyOnceWith(
      providedComponentSubnetId(packer),
    );

    cleanup();
    editor.armed = providedComponentSubnetId(packer);
    renderPanel();
    const armed = screen.getByRole("button", { name: /Packer/ });
    expect(armed.getAttribute("aria-pressed")).toBe("true");
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

    fireEvent.dragStart(screen.getByRole("button", { name: /Sorter/ }), {
      dataTransfer,
    });

    expect(readDraggedComponent(dataTransfer)).toBe(
      providedComponentSubnetId(sorter),
    );
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
