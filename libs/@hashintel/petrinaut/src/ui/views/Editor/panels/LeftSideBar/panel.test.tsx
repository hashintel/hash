/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useEditorActions } from "../../../../../react/state/editor-context";
import { nextFrame } from "../../../../lib/readings.test-helpers";
import { renderPlugins } from "../../../../plugins/plugins-test-harness";
import { LeftSideBar } from "./panel";

vi.hoisted(() => {
  // Reduced motion: a panel is in or out of view in one step, with no slide
  // to wait for.
  globalThis.matchMedia = (() => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof matchMedia;
  // The sections of the sidebar observe their size, which jsdom does not lay
  // out.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

/** Closes and opens the sidebar of the editor it is rendered in, and opens its search. */
const SidebarControls = () => {
  const { setLeftSidebarOpen, setSearchOpen } = useEditorActions();
  return (
    <>
      <button type="button" onClick={() => setLeftSidebarOpen(false)}>
        Close the sidebar
      </button>
      <button type="button" onClick={() => setLeftSidebarOpen(true)}>
        Open the sidebar
      </button>
      <button type="button" onClick={() => setSearchOpen(true)}>
        Search
      </button>
      <button type="button" onClick={() => setSearchOpen(false)}>
        Leave the search
      </button>
    </>
  );
};

const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

const nodesGroup = () => screen.getByRole("option", { name: /Nodes/u });

/** The height the Nodes group gives its rows: `0px` while it is collapsed. */
const nodesHeight = () =>
  screen.getByText("No nodes").parentElement?.style.height;

it("finds the text searched for and the collapsed groups again after it was closed", async () => {
  renderPlugins(
    [],
    <>
      <SidebarControls />
      <LeftSideBar />
    </>,
  );
  fireEvent.click(nodesGroup());
  expect(nodesHeight()).toBe("0px");
  press("Search");
  fireEvent.change(screen.getByPlaceholderText("Find anything…"), {
    target: { value: "stock" },
  });

  press("Leave the search");
  press("Close the sidebar");
  await nextFrame();
  expect(screen.queryByPlaceholderText("Find anything…")).toBeNull();

  press("Open the sidebar");

  expect(nodesHeight()).toBe("0px");
  expect(
    screen.getByPlaceholderText<HTMLInputElement>("Find anything…").value,
  ).toBe("stock");
});
