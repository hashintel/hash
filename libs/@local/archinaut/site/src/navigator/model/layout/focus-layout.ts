/**
 * The focus view: one node at the centre, its neighbours on a ring, and
 * the other participants of each neighbouring interface on a second ring
 * behind that interface. Radii grow with the count so boxes keep clear.
 */

import {
  boundsOf,
  chipHeight,
  chipWidth,
  leafHeight,
  leafWidth,
  type Layout,
  type PlacedNode,
} from "./types";

import type { GraphIndex } from "../graph";
import type { Neighbourhood } from "../projections";

export const focusLayout = (
  index: GraphIndex,
  focus: string,
  { ring1, ring2 }: Neighbourhood,
): Layout => {
  const nodes = new Map<string, PlacedNode>();

  const sizeOf = (id: string): { width: number; height: number } => {
    const node = index.interfaces.get(id);
    return node === undefined
      ? { width: leafWidth, height: leafHeight }
      : { width: chipWidth(node.name), height: chipHeight };
  };
  const put = (id: string, centerX: number, centerY: number): void => {
    const size = sizeOf(id);
    nodes.set(id, {
      id,
      x: centerX - size.width / 2,
      y: centerY - size.height / 2,
      width: size.width,
      height: size.height,
      depth: 0,
      container: false,
    });
  };

  put(focus, 0, 0);

  const radius1 = Math.max(240, ring1.length * 36);
  const angles = new Map<string, number>();
  ring1.forEach((id, position) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * position) / ring1.length;
    angles.set(id, angle);
    put(id, Math.cos(angle) * radius1, Math.sin(angle) * radius1);
  });

  const radius2 = radius1 + 230;
  const groups = new Map<string, string[]>();
  for (const id of ring2) {
    const owner =
      ring1.find((candidate) =>
        index.interfaces
          .get(candidate)
          ?.participants.some((participant) => participant.node === id),
      ) ?? ring1[0];
    if (owner === undefined) {
      continue;
    }
    groups.set(owner, [...(groups.get(owner) ?? []), id]);
  }
  for (const [owner, members] of groups) {
    const base = angles.get(owner) ?? 0;
    const spread = Math.min(0.55, 0.16 * members.length);
    members.forEach((id, position) => {
      const angle =
        members.length === 1
          ? base
          : base - spread + (2 * spread * position) / (members.length - 1);
      put(id, Math.cos(angle) * radius2, Math.sin(angle) * radius2);
    });
  }

  return { nodes, bounds: boundsOf(nodes.values(), 60) };
};
