/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { Panel } from "react-resizable-panels";
import { afterEach, expect, it } from "vitest";

import { EdgeSeparator } from "./edge-separator";
import { ResizeGroup } from "./resize-group";

import type { ComponentProps } from "react";

afterEach(cleanup);

const split = ({
  disabled = false,
  edge = "left",
}: {
  disabled?: boolean;
  edge?: ComponentProps<typeof EdgeSeparator>["edge"];
} = {}) => (
  <>
    <input aria-label="Name" />
    <ResizeGroup>
      <Panel />
      <EdgeSeparator edge={edge} label="Resize the panel" disabled={disabled} />
      <Panel />
    </ResizeGroup>
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

it.each([
  ["left", "ew-resize"],
  ["right", "ew-resize"],
  ["bottom", "ns-resize"],
  ["top", "ns-resize"],
] as const)(
  "shows the resize cursor itself: on the %s edge, %s",
  (edge, cursor) => {
    render(split({ edge }));

    expect(parts().separator.className).toContain(`cursor_${cursor}`);
  },
);
