import {
  getItemId,
  isGroup,
} from "../../util/SelectableList/selectable-list-util";

import type {
  Item,
  ItemOrGroup,
} from "../../util/SelectableList/selectable-list";
import type { MenuItem } from "./menu";

// A submenu's `subItems` are plain `Item`s (MenuItem only constrains the
// top level), so the walk accepts either, reading the optional flag.
type MaybeSelectedItem = Item & { selected?: boolean };

export const collectSelectedIds = (
  entries: Array<ItemOrGroup<MenuItem>>,
): string[] => {
  const result: string[] = [];
  const visit = (entry: ItemOrGroup<MaybeSelectedItem>) => {
    if (isGroup(entry)) {
      for (const child of entry.items) {
        visit(child);
      }
      return;
    }
    if (entry.selected) {
      result.push(getItemId(entry));
    }
    const nested = entry.subItems;
    if (nested) {
      for (const child of nested) {
        visit(child);
      }
    }
  };
  for (const entry of entries) {
    visit(entry);
  }
  return result;
};
