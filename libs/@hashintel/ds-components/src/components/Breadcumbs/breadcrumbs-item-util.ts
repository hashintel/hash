import { Children, isValidElement } from "react";

import type { FormInputSize } from "../../util/form-shared";
import type { ItemOrGroup } from "../../util/SelectableList/selectable-list";
import type { IconName } from "../Icon/icon";
import type { MenuItem } from "../Menu/menu";
import type { Tooltip } from "../Tooltip/tooltip";
import type { ExclusifyUnion } from "type-fest";

/** A breadcrumb in a crumb's `subItems` dropdown, where nothing truncates. */
export type BreadcrumbSubItem = {
  children: React.ReactNode;
  iconName?: IconName;
  tooltip?: string;
  tooltipOptions?: Omit<
    React.ComponentProps<typeof Tooltip>,
    "children" | "content"
  >;
  /**
   * Accessible name for the crumb, for when the visible `children` alone are
   * not a sufficient label (e.g. icon-only or heavily abbreviated crumbs).
   */
  "aria-label"?: string;
  testId?: string;
} & ExclusifyUnion<
  | { href?: string }
  | { onClick?: () => void }
  | { subItems?: Array<ItemOrGroup<BreadcrumbSubItem>> }
>;

export type BreadcrumbItem = BreadcrumbSubItem & {
  /**
   * Caps the crumb's width — hover pill included — while it is visible in the
   * trail (it does not apply inside the ellipsis menu); a longer label
   * truncates with an ellipsis and gains a tooltip showing the full label
   * (unless `tooltip` is already set).
   */
  maxWidth?: React.CSSProperties["maxWidth"];
  /**
   * Rendered instead of `children` when the crumb is collapsed into the
   * ellipsis menu — e.g. to show a shorter or richer label there.
   */
  collapsedChildren?: React.ReactNode;
  /**
   * Keeps the crumb visible in place: it is never collapsed into the ellipsis
   * menu, even under width pressure or a `maxItems` cap.
   */
  noCollapse?: boolean;
};

/**
 * A trail entry: a `BreadCrumbs.Item`'s props, or any other child (`node`)
 * rendered verbatim between separators — an escape hatch for custom crumbs.
 * Custom nodes get no crumb styling and never collapse into the ellipsis menu.
 */
export type BreadcrumbEntry =
  | { item: BreadcrumbItem; node?: never }
  | { item?: never; node: React.ReactNode };

/** Converts a crumb's `subItems` (breadcrumb-shaped, possibly grouped or nested) into Menu items. */
export function toMenuSubEntries(
  entries: Array<ItemOrGroup<BreadcrumbSubItem>>,
  idPrefix: string,
): Array<ItemOrGroup<MenuItem>> {
  const toEntry = (subItem: BreadcrumbSubItem, id: string): MenuItem => {
    const base = {
      id,
      text: subItem.children,
      icon: subItem.iconName,
    };
    if (subItem.subItems) {
      return { ...base, subItems: toMenuSubEntries(subItem.subItems, id) };
    }
    if (subItem.href !== undefined) {
      return { ...base, href: subItem.href };
    }
    return { ...base, onClick: () => subItem.onClick?.() };
  };
  return entries.map((entry, index) => {
    if ("items" in entry) {
      return {
        ...entry,
        items: entry.items.map((subItem, subIndex) =>
          toEntry(subItem, `${entry.id}-${subIndex}`),
        ),
      };
    }
    return toEntry(entry, `${idPrefix}-${index}`);
  });
}

export const toMenuItem = (
  item: BreadcrumbItem,
  originalIndex: number,
): MenuItem => {
  const base = {
    id: `breadcrumb-${originalIndex}`,
    text: item.collapsedChildren ?? item.children,
    icon: item.iconName,
  };
  if (item.subItems) {
    return { ...base, subItems: toMenuSubEntries(item.subItems, base.id) };
  }
  if (item.href !== undefined) {
    return { ...base, href: item.href };
  }
  // A plain crumb still needs an action in the menu; selecting it just closes.
  return { ...base, onClick: () => item.onClick?.() };
};

export const crumbStyle = (
  item: BreadcrumbItem,
): React.CSSProperties | undefined =>
  item.maxWidth !== undefined ? { maxWidth: item.maxWidth } : undefined;

export const chevronIcons = (
  size: FormInputSize,
): { right: IconName; down: IconName } =>
  size === "lg"
    ? { right: "chevronRight", down: "chevronDown" }
    : { right: "chevronRightHeavy", down: "chevronDownHeavy" };

export const collectEntries = (
  children: React.ReactNode,
  itemComponent: React.JSXElementConstructor<BreadcrumbItem>,
): BreadcrumbEntry[] =>
  Children.toArray(children).map((child) =>
    isValidElement<BreadcrumbItem>(child) && child.type === itemComponent
      ? { item: child.props }
      : { node: child },
  );

export const isCollapsible = (entry: BreadcrumbEntry): boolean =>
  entry.item !== undefined && !entry.item.noCollapse;
