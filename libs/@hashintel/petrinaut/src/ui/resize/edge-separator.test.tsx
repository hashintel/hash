/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

const renderSplit = () => {
  render(
    <>
      <input aria-label="Name" />
      <Group>
        <Panel />
        <EdgeSeparator edge="left" label="Resize the panel" />
        <Panel />
      </Group>
    </>,
  );
  return {
    field: screen.getByRole("textbox", { name: "Name" }),
    separator: screen.getByRole("separator", { name: "Resize the panel" }),
  };
};

it("hands the focus back to where it was when a press focuses the separator", () => {
  const { field, separator } = renderSplit();
  field.focus();

  fireEvent.pointerDown(separator);
  separator.focus();

  expect(document.activeElement).toBe(field);
  expect(separator.getAttribute("data-separator")).not.toBe("focus");
});

it("stays out of the Tab order", () => {
  const { separator } = renderSplit();

  expect(separator.tabIndex).toBe(-1);
});
