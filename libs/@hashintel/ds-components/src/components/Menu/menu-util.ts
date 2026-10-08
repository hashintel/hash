import {
  getItemId,
  isGroup,
} from "../../util/SelectableList/selectable-list-util";

import type { ItemOrGroup } from "../../util/SelectableList/selectable-list";
import type { MenuItem } from "./menu";

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
