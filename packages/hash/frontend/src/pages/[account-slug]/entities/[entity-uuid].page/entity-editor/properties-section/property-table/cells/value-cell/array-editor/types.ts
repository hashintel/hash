import { EditorType } from "../types";

export interface SortableItem {
  value: unknown;
  id: string;
  index: number;
  /** @todo explain why/how overriddenEditorType is used */
  overriddenEditorType?: EditorType;
}
