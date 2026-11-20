import { ComponentsPanel } from "./subviews/components-panel";
import { EntitiesHeaderAction, EntitiesTree } from "./subviews/entities-tree";
import { NetNavigationList, NetsHeaderAction } from "./subviews/nets-list";
import {
  SearchContent,
  SearchHeaderAction,
  SearchIcon,
  SearchTitle,
} from "./subviews/search-panel";

import type { SubView } from "../../../../components/sub-view/types";

export const entitiesTreeSubView: SubView = {
  id: "entities-tree",
  title: "Entities",
  component: EntitiesTree,
  headerAction: EntitiesHeaderAction,
  main: true,
  alwaysShowHeaderAction: true,
};

export const netsListSubView: SubView = {
  id: "nets-list",
  title: "Nets",
  tooltip:
    "View the root net and the document's components. Mark a component's places as ports, then place instances of it in the root net.",
  component: NetNavigationList,
  headerAction: NetsHeaderAction,
  headerActionMutates: true,
  defaultCollapsed: false,
};

export const componentsSubView: SubView = {
  id: "components",
  title: "Components",
  tooltip:
    "The components of the libraries this editor offers. Click one, then the canvas, to place an instance of it, or drag it onto the canvas.",
  component: ComponentsPanel,
};

export const searchSubView: SubView = {
  id: "search",
  title: "Search",
  icon: SearchIcon,
  component: SearchContent,
  titleComponent: SearchTitle,
  headerAction: SearchHeaderAction,
  alwaysShowHeaderAction: true,
  main: true,
};
