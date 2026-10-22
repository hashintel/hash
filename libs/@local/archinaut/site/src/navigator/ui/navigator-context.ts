/**
 * What every part of the map reads: the indexed graph, the pages the site
 * has, the view state with its transitions, and the two ways out, to a
 * page or back to the docs.
 */

import { createContext, use } from "react";

import type { ManifestPage } from "../../../../src/bundle/outputs";
import type { GraphIndex } from "../model/graph";
import type { ViewState } from "../view-state";

export type Transition = (state: ViewState) => ViewState;

export interface NavigatorServices {
  index: GraphIndex;
  /** Pages by slug, for the links a node offers. */
  pages: Map<string, ManifestPage>;
  /** The node the page behind the map is about, when it is about one. */
  current: string | null;
  state: ViewState;
  update: (transition: Transition) => void;
  /** Leaves the map for a page. */
  open: (slug: string) => void;
  /** Leaves the map for the page behind it. */
  close: () => void;
}

export const NavigatorContext = createContext<NavigatorServices | null>(null);

export const useNavigator = (): NavigatorServices => {
  const services = use(NavigatorContext);
  if (services === null) {
    throw new Error("useNavigator must be called inside NavigatorContext");
  }
  return services;
};
