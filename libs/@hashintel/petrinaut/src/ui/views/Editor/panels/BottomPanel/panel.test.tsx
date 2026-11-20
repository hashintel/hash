/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useEditorActions } from "../../../../../react/state/editor-context";
import { definePetrinautPlugin } from "../../../../plugins/define-petrinaut-plugin";
import { renderPlugins } from "../../../../plugins/plugins-test-harness";
import { BottomPanel } from "./panel";

import type { ReactNode } from "react";

// The timeline's chart library reads the pixel ratio as its module loads.
vi.hoisted(() => {
  globalThis.matchMedia = (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof matchMedia;
});

afterEach(cleanup);

/** Opens the bottom panel of the editor it is rendered in. */
const WithPanelOpen = ({ children }: { children: ReactNode }) => {
  const { setBottomPanelOpen } = useEditorActions();
  useEffect(() => setBottomPanelOpen(true), [setBottomPanelOpen]);
  return children;
};

const notesPlugin = definePetrinautPlugin(
  {
    id: "test.notes",
    name: "Notes",
    bottomPanelViews: { notes: { title: "Notes" } },
  },
  {
    bottomPanelViews: {
      notes: {
        content: "Nothing noted",
        headerAction: <button type="button">Clear notes</button>,
      },
    },
  },
);

const view = (
  <WithPanelOpen>
    <BottomPanel />
  </WithPanelOpen>
);

const tabNames = () =>
  screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"));
const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")
    ?.getAttribute("aria-label");

describe("BottomPanel", () => {
  it("shows a plugin's view as a tab after its own, with its content and header action", () => {
    renderPlugins([notesPlugin], view);

    expect(tabNames()).toEqual(["Diagnostics", "Simulation Settings", "Notes"]);
    expect(screen.queryByText("Nothing noted")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear notes" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));

    expect(selectedTab()).toBe("Notes");
    expect(screen.getByRole("tabpanel").textContent).toBe("Nothing noted");
    expect(screen.getByRole("button", { name: "Clear notes" })).toBeTruthy();
  });

  it("returns to its first tab when the plugin of the active one stops", () => {
    const { rerender } = renderPlugins([notesPlugin], view);
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(selectedTab()).toBe("Notes");

    rerender([]);

    expect(tabNames()).toEqual(["Diagnostics", "Simulation Settings"]);
    expect(selectedTab()).toBe("Diagnostics");
    expect(screen.queryByText("Nothing noted")).toBeNull();
  });
});
