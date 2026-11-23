import { ComponentsPanel } from "./subviews/components-panel";
import { EntitiesHeaderAction, EntitiesTree } from "./subviews/entities-tree";
import { NetNavigationList, NetsHeaderAction } from "./subviews/nets-list";
import {
  SearchContent,
  SearchHeaderAction,
  SearchIcon,
  SearchTitle,
} from "./subviews/search-panel";

import type { SubView } from "../../../../sub-view/types";

const entitiesTreeSubView: SubView = {
  id: "entities-tree",
  title: "Entities",
  component: EntitiesTree,
  headerAction: EntitiesHeaderAction,
  main: true,
};

const netsListSubView: SubView = {
  id: "nets-list",
  title: "Nets",
  tooltip:
    "View the root net and the document's components. Mark a component's places as ports, then place instances of it in the root net.",
  component: NetNavigationList,
  headerAction: NetsHeaderAction,
  headerActionMutates: true,
};

const componentsSubView: SubView = {
  id: "components",
  title: "Components",
  tooltip:
    "The components of the libraries this editor offers. Click one, then the canvas, to place an instance of it, or drag it onto the canvas.",
  component: ComponentsPanel,
};

/**
 * The sub-views the sidebar lists. The Nets list and the Components panel are
 * part of the composition interface. The Components panel lists the libraries
 * on offer, and is all an editor that only composes has to show.
 */
export const leftSidebarSubViews = ({
  composesOnly,
  compositionInterfaceOn,
  offersLibraries,
}: {
  composesOnly: boolean;
  compositionInterfaceOn: boolean;
  offersLibraries: boolean;
}): SubView[] => [
  ...(composesOnly ? [] : [entitiesTreeSubView]),
  ...(compositionInterfaceOn && !composesOnly ? [netsListSubView] : []),
  ...(compositionInterfaceOn && offersLibraries ? [componentsSubView] : []),
];

export const searchSubView: SubView = {
  id: "search",
  title: "Search",
  icon: SearchIcon,
  component: SearchContent,
  titleComponent: SearchTitle,
  headerAction: SearchHeaderAction,
  main: true,
};
