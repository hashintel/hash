/**
 * What the map shows, as plain data with pure transitions. The state
 * outlives the overlay being closed, so the map comes back as it was left.
 */

import type { Audience } from "../../../src/model";
import type { EdgeKinds, Projection } from "./model/projections";

export type Mode = "map" | "focus";

export interface ViewState {
  mode: Mode;
  /** The centred node in focus mode. */
  focus: string | null;
  selected: string | null;
  /** The node the map view fits to, or null for the whole map. */
  region: string | null;
  projection: Projection;
  tags: string[];
  audience: Audience | null;
  edgeKinds: EdgeKinds;
  query: string;
}

export const initialViewState: ViewState = {
  mode: "map",
  focus: null,
  selected: null,
  region: null,
  projection: "hypergraph",
  tags: [],
  audience: null,
  edgeKinds: { imports: true, declared: true, interfaces: true },
  query: "",
};

const isInterface = (id: string | null): boolean =>
  id?.startsWith("iface:") ?? false;

export const select = (state: ViewState, id: string | null): ViewState => ({
  ...state,
  selected: id,
});

export const focusOn = (state: ViewState, id: string): ViewState => ({
  ...state,
  mode: "focus",
  focus: id,
  selected: id,
  // Interfaces are only nodes in the hypergraph projection.
  projection: isInterface(id) ? "hypergraph" : state.projection,
});

export const exitFocus = (state: ViewState): ViewState => ({
  ...state,
  mode: "map",
  focus: null,
});

/** Selects a node and brings the view to the region holding it. */
export const reveal = (
  state: ViewState,
  id: string,
  region: string | null,
): ViewState => ({
  ...exitFocus(state),
  selected: id,
  region,
});

export const fitAll = (state: ViewState): ViewState => ({
  ...state,
  region: null,
});

export const setProjection = (
  state: ViewState,
  projection: Projection,
): ViewState =>
  projection === "pairwise" && isInterface(state.focus)
    ? { ...exitFocus(state), projection }
    : { ...state, projection };

export const toggleTag = (state: ViewState, tag: string): ViewState => ({
  ...state,
  tags: state.tags.includes(tag)
    ? state.tags.filter((candidate) => candidate !== tag)
    : [...state.tags, tag],
});

export const setAudience = (
  state: ViewState,
  audience: Audience,
): ViewState => ({
  ...state,
  audience: state.audience === audience ? null : audience,
});

export const toggleEdgeKind = (
  state: ViewState,
  kind: keyof EdgeKinds,
): ViewState => ({
  ...state,
  edgeKinds: { ...state.edgeKinds, [kind]: !state.edgeKinds[kind] },
});

export const setQuery = (state: ViewState, query: string): ViewState => ({
  ...state,
  query,
});

export const clearFilters = (state: ViewState): ViewState => ({
  ...state,
  tags: [],
  audience: null,
  query: "",
});
