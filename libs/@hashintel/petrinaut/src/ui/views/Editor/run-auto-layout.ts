import { calculateGraphLayout } from "../../lib/calculate-graph-layout";

import type { MutationContextValue } from "../../../react/state/mutation-context";
import type { SDCPN } from "@hashintel/petrinaut-core";

type NodeDimensions = {
  place: { width: number; height: number };
  transition: { width: number; height: number };
};

/**
 * Run auto-layout on the current SDCPN and apply the computed positions via
 * the Mutation bridge.
 *
 * This composes the layout primitives in `/ui` so `/react` doesn't have to
 * reach for visual dimensions. The mutate side flows through
 * {@link MutationContextValue.commitNodePositions} — the same path used by
 * drag commits — so read-only / simulate-mode guards apply uniformly.
 *
 * `dimensions` should be layout-stable (independent of the user's
 * `compactNodes` choice) — see the note in `node-dimensions.ts`.
 */
export async function runAutoLayout({
  sdcpn,
  dimensions,
  commitNodePositions,
}: {
  sdcpn: SDCPN;
  dimensions: NodeDimensions;
  commitNodePositions: MutationContextValue["commitNodePositions"];
}): Promise<void> {
  if (sdcpn.places.length === 0 && sdcpn.transitions.length === 0) {
    return;
  }

  const positions = await calculateGraphLayout(sdcpn, dimensions);

  const commits: Parameters<MutationContextValue["commitNodePositions"]>[0]["commits"] = [];

  for (const place of sdcpn.places) {
    const position = positions[place.id];
    if (position && (place.x !== position.x || place.y !== position.y)) {
      commits.push({ id: place.id, itemType: "place", position });
    }
  }

  for (const transition of sdcpn.transitions) {
    const position = positions[transition.id];
    if (position && (transition.x !== position.x || transition.y !== position.y)) {
      commits.push({
        id: transition.id,
        itemType: "transition",
        position,
      });
    }
  }

  if (commits.length > 0) {
    commitNodePositions({ commits });
  }
}
