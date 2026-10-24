/**
 * What the map shows, as plain data with pure transitions. The state
 * outlives the panel being closed, so the map comes back as it was left.
 */

export type Mode = "map" | "focus";

export interface ViewState {
  mode: Mode;
  /** The centred node in focus mode. */
  focus: string | null;
  selected: string | null;
  /** The node the map view fits to, or null for the whole map. */
  region: string | null;
  /** Domain tags; a node outside them dims. */
  tags: string[];
  query: string;
}

export const initialViewState: ViewState = {
  mode: "map",
  focus: null,
  selected: null,
  region: null,
  tags: [],
  query: "",
};

export const select = (state: ViewState, id: string | null): ViewState => ({
  ...state,
  selected: id,
});

export const focusOn = (state: ViewState, id: string): ViewState => ({
  ...state,
  mode: "focus",
  focus: id,
  selected: id,
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

export const toggleTag = (state: ViewState, tag: string): ViewState => ({
  ...state,
  tags: state.tags.includes(tag)
    ? state.tags.filter((candidate) => candidate !== tag)
    : [...state.tags, tag],
});

export const setQuery = (state: ViewState, query: string): ViewState => ({
  ...state,
  query,
});

export const clearFilters = (state: ViewState): ViewState => ({
  ...state,
  tags: [],
  query: "",
});
