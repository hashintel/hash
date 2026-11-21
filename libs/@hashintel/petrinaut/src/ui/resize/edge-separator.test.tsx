/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { Group, Panel } from "react-resizable-panels";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { EdgeSeparator } from "./edge-separator";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const split = ({ disabled = false } = {}) => (
  <>
    <input aria-label="Name" />
    <Group>
      <Panel />
      <EdgeSeparator edge="left" label="Resize the panel" disabled={disabled} />
      <Panel />
    </Group>
  </>
);

const parts = () => ({
  field: screen.getByRole("textbox", { name: "Name" }),
  separator: screen.getByRole("separator", { name: "Resize the panel" }),
});

it("leaves the focus where it is when it is asked to take it, as the library asks on a press", () => {
  render(split());
  const { field, separator } = parts();
  field.focus();

  separator.focus();

  expect(document.activeElement).toBe(field);
});

it("is no Tab stop, also once it has been disabled and enabled again", () => {
  const view = render(split());
  const { separator } = parts();
  expect(separator.hasAttribute("tabindex")).toBe(false);

  view.rerender(split({ disabled: true }));
  view.rerender(split());

  expect(separator.hasAttribute("tabindex")).toBe(false);
});
