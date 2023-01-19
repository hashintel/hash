import { EditorType } from "../types";

export interface SortableItem {
  value: unknown;
  id: string;
  index: number;
  // if overriddenEditorType is defined, sortable item's editor type will be this editor type
  overriddenEditorType?: EditorType;
}
