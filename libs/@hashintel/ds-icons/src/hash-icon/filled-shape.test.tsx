/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HashIcon } from "../hash-icon";
import { paintCube, projectCubeFaces } from "./shared/cube-projection";

import type { HashIconName } from "../hash-icon";

afterEach(cleanup);

const symbolsWithCutouts: HashIconName[] = [
  "warning",
  "lockClosed",
  "probabilityDice",
  "fileLines",
  "agent",
  "terminal",
  "variableRegister",
  "tokenTypeTag",
  "subnetLayers",
  "hand",
];

describe("filled icon artwork", () => {
  it.each(["listTree", "diagramSubtask"] as const)(
    "fills only closed nodes in %s and leaves its connectors unfilled",
    (name) => {
      const { container } = render(<HashIcon name={name} variant="filled" />);
      const paths = Array.from(container.querySelectorAll("path"));
      const connectors = paths.filter(
        (path) => !path.getAttribute("d")?.endsWith("Z"),
      );
      expect(connectors.length).toBeGreaterThan(0);
      for (const connector of connectors) {
        expect(connector.getAttribute("fill")).toBe("none");
      }
      const nodes = paths.filter((path) =>
        path.getAttribute("d")?.endsWith("Z"),
      );
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(node.closest('g[fill="currentColor"]')).not.toBeNull();
        expect(node.getAttribute("d")).not.toMatch(/M4 /);
      }
    },
  );

  it("keeps interior details transparent and each mask local to its icon", () => {
    const Icons = ({ filled }: { filled: boolean }) => (
      <>
        {symbolsWithCutouts.flatMap((name) =>
          [0, 1].map((instance) => (
            <HashIcon
              key={`${name}-${instance}`}
              name={name}
              variant={filled ? "filled" : "outline"}
            />
          )),
        )}
      </>
    );
    const { container, rerender } = render(<Icons filled />);
    const ids = Array.from(container.querySelectorAll("mask"), ({ id }) => id);
    expect(ids).toHaveLength(symbolsWithCutouts.length * 2);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of container.querySelectorAll("svg")) {
      const mask = svg.querySelector("mask");
      expect(svg.querySelector("g[mask]")?.getAttribute("mask")).toBe(
        `url(#${mask?.id})`,
      );
      expect(mask?.querySelector('g[stroke="black"]')).not.toBeNull();
      for (const paint of svg.querySelectorAll(
        '[fill="white"], [stroke="black"], [color="black"]',
      )) {
        expect(paint.closest("mask")).toBe(mask);
      }
    }
    rerender(<Icons filled={false} />);
    expect(container.querySelector("mask")).toBeNull();
    rerender(<Icons filled />);
    expect(
      Array.from(container.querySelectorAll("mask"), ({ id }) => id),
    ).toEqual(ids);
  });

  it("preserves animated detail hooks when changing style", () => {
    const names: HashIconName[] = [
      ...symbolsWithCutouts,
      "bell",
      "bug",
      "calendar",
      "eye",
      "parameter",
      "shapes",
    ];
    for (const name of names) {
      const { container, rerender, unmount } = render(<HashIcon name={name} />);
      const hooks = () =>
        Array.from(
          container.querySelectorAll("[data-icon-detail], [data-icon-part]"),
          (element) =>
            element.getAttribute("data-icon-detail") ??
            element.getAttribute("data-icon-part"),
        ).sort((left, right) => (left ?? "").localeCompare(right ?? ""));
      const outlineHooks = hooks();
      rerender(<HashIcon name={name} variant="filled" />);
      expect(hooks(), name).toEqual(outlineHooks);
      unmount();
    }
  });

  it("fills closed bodies while keeping connection lines open", () => {
    const { container, rerender } = render(
      <HashIcon name="subnetNetwork" variant="filled" />,
    );
    expect(
      container
        .querySelector('path[data-icon-draw="boundary"]')
        ?.getAttribute("fill"),
    ).toBe("none");
    expect(
      container
        .querySelector('path[data-icon-draw="connections"]')
        ?.getAttribute("fill"),
    ).toBe("none");
    expect(
      container.querySelector("circle")?.closest('g[fill="currentColor"]'),
    ).not.toBeNull();
    rerender(<HashIcon name="parameter" variant="filled" />);
    expect(
      container.querySelectorAll('circle[data-icon-draw][fill="currentColor"]'),
    ).toHaveLength(2);
    rerender(<HashIcon name="microphone" variant="filled" muted />);
    expect(
      container.querySelector("rect")?.closest('g[fill="currentColor"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-icon-part="mute"]')
        ?.getAttribute("stroke-dasharray"),
    ).toBe("1");
  });

  it("keeps filled cube faces aligned with their rotating edges", () => {
    const { container } = render(<HashIcon name="cube" variant="filled" />);
    const cube = container.querySelector("[data-icon-cube]");
    expect(cube).not.toBeNull();
    if (!cube) throw new Error("Cube geometry missing");
    for (const angle of [0, 35, 90, 125, 215, 305, 395]) {
      paintCube(cube, angle);
      const visibleFaces = projectCubeFaces(angle).filter(
        ({ visible }) => visible,
      );
      expect(
        cube.querySelectorAll('[data-cube-face][visibility="visible"]'),
      ).toHaveLength(visibleFaces.length);
      const visibleEdges = Array.from(
        cube.querySelectorAll('[data-cube-edge][visibility="visible"]'),
        (edge) => edge.getAttribute("d"),
      );
      for (const face of visibleFaces) {
        const surface = cube.querySelector(`[data-cube-face="${face.index}"]`);
        expect(surface?.getAttribute("d")).toBe(face.path);
        for (const point of face.path.slice(1, -1).split("L")) {
          expect(visibleEdges.some((edge) => edge?.includes(point))).toBe(true);
        }
      }
    }
  });

  it("does not turn arrows or equations into filled polygons", () => {
    for (const name of [
      "arrowUp",
      "differentialEquation",
      "equationFlow",
      "code",
    ] as const) {
      const { container, unmount } = render(
        <HashIcon name={name} variant="filled" />,
      );
      expect(
        container.querySelector("g[fill='currentColor']"),
        name,
      ).toBeNull();
      expect(container.querySelector("mask"), name).toBeNull();
      unmount();
    }
  });
});
