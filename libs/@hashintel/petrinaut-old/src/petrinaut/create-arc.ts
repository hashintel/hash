import type { ArcType } from "./types";

const connectionExists = (arc: ArcType, arcs: ArcType[]) => {
  return arcs.some(
    (el) =>
      el.source === arc.source &&
      el.target === arc.target &&
      (el.sourceHandle === arc.sourceHandle ||
        (!el.sourceHandle && !arc.sourceHandle)) &&
      (el.targetHandle === arc.targetHandle ||
        (!el.targetHandle && !arc.targetHandle)),
  );
};

/**
 * This is a variant of reactflow's `addEdge`. We use this so we can control adding the arc to the definition by mutation.
 * addEdge otherwise creates a new array with the edge added via concat.
 *
 * We don't need a lot of the checking in there because we require a properly constructed ArcType to be passed in.
 *
 * @see https://github.com/xyflow/xyflow/blob/04055c9625cbd92cf83a2f4c340d6fae5199bfa3/packages/system/src/utils/edges/general.ts#L113
 *
 * @returns ArcType if the arc shouod be added, null if it should not (because it already exists)
 */
export const createArc = (arc: ArcType, arcs: ArcType[]): ArcType | null => {
  if (connectionExists(arc, arcs)) {
    return null;
  }

  return arc;
};
