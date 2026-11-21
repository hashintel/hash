/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { GlassPanel } from "./glass-panel";

afterEach(cleanup);

it("marks the edge that is being dragged, from the press to the release", () => {
  const onResizeEnd = vi.fn();
  render(
    <GlassPanel
      resizable={{
        edge: "left",
        getSize: () => 300,
        onResize: () => {},
        onResizeEnd,
      }}
    >
      <p>Content</p>
    </GlassPanel>,
  );
  const handle = screen.getByRole("button", { name: "Resize panel from left" });
  const panel = handle.parentElement!;
  expect(panel.hasAttribute("data-resizing-edge")).toBe(false);

  fireEvent.mouseDown(handle, { clientX: 100 });
  expect(panel.getAttribute("data-resizing-edge")).toBe("left");

  fireEvent.mouseUp(document);
  expect(panel.hasAttribute("data-resizing-edge")).toBe(false);
  expect(onResizeEnd).toHaveBeenCalledOnce();
});
