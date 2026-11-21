/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createPanelPresence } from "../../../../react/state/panel-presence";
import { PanelPresenceContext } from "../../../../react/state/panel-presence-context";
import { nextFrame } from "../../../lib/readings.test-helpers";
import { DockedPanel } from "./docked-panel";

afterEach(cleanup);

const presenceWith = (isSidebarOpen: boolean) =>
  createPanelPresence({
    open: {
      leftSidebar: isSidebarOpen,
      propertiesPanel: false,
      bottomPanel: false,
      aiAssistant: false,
    },
    isAssistantDocked: true,
  });

const Sidebar = ({ isOpen }: { isOpen: boolean }) => (
  <DockedPanel panel="leftSidebar" isOpen={isOpen}>
    <p>Entities</p>
  </DockedPanel>
);

it("mounts nothing of a closed panel but the element that holds its place", () => {
  const { container } = render(
    <PanelPresenceContext value={presenceWith(false)}>
      <Sidebar isOpen={false} />
    </PanelPresenceContext>,
  );

  expect(screen.queryByText("Entities")).toBeNull();
  expect(container.children).toHaveLength(1);
  expect(container.firstElementChild?.childElementCount).toBe(0);
});

it("mounts a panel in the render that opens it, inside the element that was there", () => {
  const presence = presenceWith(false);
  const { container, rerender } = render(
    <PanelPresenceContext value={presence}>
      <Sidebar isOpen={false} />
    </PanelPresenceContext>,
  );
  const dock = container.firstElementChild;

  rerender(
    <PanelPresenceContext value={presence}>
      <Sidebar isOpen />
    </PanelPresenceContext>,
  );

  expect(container.firstElementChild).toBe(dock);
  expect(dock?.contains(screen.getByText("Entities"))).toBe(true);
});

it("keeps a closed panel mounted until it has slid out", async () => {
  const presence = presenceWith(true);
  const { rerender } = render(
    <PanelPresenceContext value={presence}>
      <Sidebar isOpen />
    </PanelPresenceContext>,
  );

  rerender(
    <PanelPresenceContext value={presence}>
      <Sidebar isOpen={false} />
    </PanelPresenceContext>,
  );
  presence.shown.leftSidebar.set(0.4);
  await nextFrame();
  expect(screen.queryByText("Entities")).not.toBeNull();

  presence.shown.leftSidebar.set(0);
  await nextFrame();
  expect(screen.queryByText("Entities")).toBeNull();
});
