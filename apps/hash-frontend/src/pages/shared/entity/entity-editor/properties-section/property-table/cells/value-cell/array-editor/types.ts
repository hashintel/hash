import type { ClosedDataType } from "@blockprotocol/type-system";

export interface SortableItem {
  value: unknown;
  id: string;
  index: number;
  dataType: ClosedDataType;
}
