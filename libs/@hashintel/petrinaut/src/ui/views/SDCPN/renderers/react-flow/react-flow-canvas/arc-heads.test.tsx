/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ArcHeads } from "./arc-heads";

afterEach(cleanup);

it("draws each head as one filled shape, and marks the heads of the arcs in focus", () => {
  const { container } = render(
    <ArcHeads
      heads={[
        { id: "plain", color: "#123456", inFocus: false },
        { id: "focus", color: "#abcdef", inFocus: true },
      ]}
    />,
  );

  const plain = container.querySelector("marker#plain");
  const inFocus = container.querySelector("marker#focus");
  // One shape with no stroke: a faded head has one strength all over.
  expect(plain?.children).toHaveLength(1);
  expect(plain?.querySelector(".arc-head")?.getAttribute("stroke")).toBeNull();
  // The pane fades every head that is not marked as it marks a node in focus.
  expect(plain?.querySelector(".arc-head.canvas-focus-role")).toBeNull();
  expect(inFocus?.querySelector(".arc-head.canvas-focus-role")).not.toBeNull();
});
