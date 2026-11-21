/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { useArcHeadRoles } from "./use-arc-head-roles";

import type { CanvasArcFocus } from "../../../canvas-focus";
import type { CanvasArc, CanvasScene } from "../../../canvas-scene";

afterEach(cleanup);

const arc = (id: string, focus: CanvasArcFocus): CanvasArc => ({
  id,
  kind: "standard",
  weight: 1,
  sourceId: "place",
  targetId: "transition",
  sourcePortId: null,
  targetPortId: null,
  transitionId: "transition",
  color: "#123456",
  selected: false,
  focus,
});

const sceneOf = (roles: Record<string, CanvasArcFocus>): CanvasScene => ({
  nodes: [],
  fusions: [],
  arcs: Object.entries(roles).map(([id, focus]) => arc(id, focus)),
  focusActive: Object.values(roles).some((focus) => focus !== "none"),
});

const rolesIn = (scene: CanvasScene) =>
  renderHook((input: CanvasScene) => useArcHeadRoles(input), {
    initialProps: scene,
  });

it("lists the arcs that have a role while the canvas has a focus", () => {
  const { result } = rolesIn(
    sceneOf({ a: "incoming", b: "none", c: "focused" }),
  );

  expect([...result.current]).toEqual([
    ["a", "incoming"],
    ["c", "focused"],
  ]);
});

it("lists none before the canvas has had a focus", () => {
  const { result } = rolesIn(sceneOf({ a: "none" }));

  expect(result.current.size).toBe(0);
});

it("keeps the roles of the focus that ended, until another begins", () => {
  const { result, rerender } = rolesIn(sceneOf({ a: "incoming", b: "none" }));

  rerender(sceneOf({ a: "none", b: "none" }));
  expect([...result.current]).toEqual([["a", "incoming"]]);

  rerender(sceneOf({ a: "none", b: "outgoing" }));
  expect([...result.current]).toEqual([["b", "outgoing"]]);
});

it("returns the same list for the same arcs, so the elements built from it hold", () => {
  const scene = sceneOf({ a: "incoming" });
  const { result, rerender } = rolesIn(scene);
  const first = result.current;

  rerender({ ...scene });
  expect(result.current).toBe(first);
});
