/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ArcHeads } from "./arc-heads";

afterEach(cleanup);

it("draws each head as one filled shape, and marks the head of a role", () => {
  const { container } = render(
    <ArcHeads
      heads={[
        { id: "none", color: "#123456", haloColor: undefined },
        { id: "incoming", color: "#123456", haloColor: "#abcdef" },
      ]}
    />,
  );

  const fading = container.querySelector("marker#none");
  const ofRole = container.querySelector("marker#incoming");
  // One shape with no stroke: a faded head has one strength all over.
  expect(fading?.children).toHaveLength(1);
  expect(fading?.querySelector(".arc-head")?.getAttribute("stroke")).toBeNull();
  // The pane fades every head that is not marked as it marks a node in focus.
  expect(fading?.querySelector(".arc-head.canvas-focus-role")).toBeNull();
  expect(ofRole?.querySelector(".arc-head.canvas-focus-role")).not.toBeNull();
});

it("gives each shape the colours the pane fills it from", () => {
  const { container } = render(
    <ArcHeads
      heads={[
        { id: "none", color: "#123456", haloColor: undefined },
        { id: "incoming", color: "#123456", haloColor: "#abcdef" },
      ]}
    />,
  );

  const colorsOf = (id: string) => {
    const shape = container.querySelector<SVGPathElement>(`#${id} .arc-head`);
    return [
      shape?.style.getPropertyValue("--arc-head-color"),
      shape?.style.getPropertyValue("--arc-head-halo"),
    ];
  };
  expect(colorsOf("none")).toEqual(["#123456", ""]);
  // The casing's colour while the canvas has a focus, the arc's own after.
  expect(colorsOf("incoming")).toEqual(["#123456", "#abcdef"]);
});
