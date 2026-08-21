import { Children, isValidElement } from "react";

import { Item } from "./breadcrumbs-item";

import type { BreadcrumbEntry, BreadcrumbItem } from "./breadcrumbs-item";

const isItemElement = (
  child: React.ReactNode,
): child is React.ReactElement<BreadcrumbItem> =>
  isValidElement(child) && child.type === Item;

export const collectEntries = (children: React.ReactNode): BreadcrumbEntry[] =>
  Children.toArray(children).map((child) =>
    isItemElement(child) ? { item: child.props } : { node: child },
  );

export const isCollapsible = (entry: BreadcrumbEntry): boolean =>
  entry.item !== undefined && !entry.item.noCollapse;
