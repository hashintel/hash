import { getItemId, isGroup } from "./SelectableList/selectable-list-util";

import type { MenuItem } from "./menu";
import type { ItemOrGroup } from "./SelectableList/selectable-list";

export const collectSelectedIds = (
  entries: Array<ItemOrGroup<MenuItem>>,
): string[] => {
  const result: string[] = [];
  const visit = (entry: ItemOrGroup<MenuItem>) => {
    if (isGroup(entry)) {
      for (const child of entry.items) {
        visit(child);
      }
      return;
    }
    if (entry.selected) {
      result.push(getItemId(entry));
    }
    if (entry.subItems) {
      for (const child of entry.subItems) {
        visit(child);
      }
    }
  };
  for (const entry of entries) {
    visit(entry);
  }
  return result;
};
