import type { FormInputSize } from "../../util/form-shared";
import type { ItemOrGroup } from "../../util/SelectableList/selectable-list";
import type { IconName } from "../Icon/icon";
import type { MenuItem } from "../Menu/menu";
import type { BreadcrumbItem, BreadcrumbSubItem } from "./breadcrumbs-item";

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
