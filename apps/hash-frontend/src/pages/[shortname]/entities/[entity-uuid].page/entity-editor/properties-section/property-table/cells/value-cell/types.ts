import type {
  CustomCell,
  ProvideEditorComponent,
} from "@glideapps/glide-data-grid";

import type { TooltipCellProps } from "../../../../../../../../../components/grid/utils/use-grid-tooltip/types";
import type { PropertyRow } from "../../types";

export interface ValueCellProps extends TooltipCellProps {
  readonly kind: "value-cell";
  propertyRow: PropertyRow;
}

export type ValueCell = CustomCell<ValueCellProps>;

export type EditorType =
  | "boolean"
  | "number"
  | "string"
  | "object"
  | "emptyList"
  | "null"
  | "unknown";

export type OnTypeChange = (type: EditorType) => void;

export type ValueCellEditorComponent = ProvideEditorComponent<ValueCell>;
