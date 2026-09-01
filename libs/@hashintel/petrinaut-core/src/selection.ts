/**
 * Dependency-free entry exposing only the selection vocabulary. Hosts that
 * validate selection outside the app — URL search params in a browser route, an
 * HTTP request in a server function — can import this without pulling the model,
 * the simulation engine, or any React code.
 */
export { canonicalizeSelection, selectionItemTypes } from "./types/selection";
export type {
  PanelTarget,
  SelectionItem,
  SelectionItemType,
  SelectionMap,
} from "./types/selection";
