import {
  buildConnectionIndex,
  buildDependentCounts,
  buildNetGraph,
  buildNotebookCells,
} from "../notebook-model";

import type { ActiveNetDefinition } from "../../../../react/state/active-net-context";
import type {
  CellConnections,
  DependentCount,
  NetGraph,
  NotebookCell,
} from "../notebook-model";

/**
 * What the view derives from the net alone. An update that leaves the net as
 * it is (a selection, a search, a focus move) derives none of it again.
 */
export type NotebookViewModel = {
  /** The cells in the order the net stores them. */
  documentCells: NotebookCell[];
  connectionIndex: Map<string, CellConnections>;
  dependentCounts: Map<string, DependentCount>;
  netGraph: NetGraph;
  /** Token-type colour per place, so the diagram can echo the canvas palette. */
  placeColors: Map<string, string>;
};

export const buildNotebookViewModel = (
  net: ActiveNetDefinition,
): NotebookViewModel => {
  const connectionIndex = buildConnectionIndex(net);
  return {
    documentCells: buildNotebookCells(net),
    connectionIndex,
    dependentCounts: buildDependentCounts(connectionIndex),
    netGraph: buildNetGraph(net),
    placeColors: new Map(
      net.places.flatMap((place) => {
        const color = net.types.find(({ id }) => id === place.colorId);
        return color === undefined
          ? []
          : [[place.id, color.displayColor] as const];
      }),
    ),
  };
};
