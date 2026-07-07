import type { TooltipCellProps } from "../../../../../../../../components/grid/utils/use-grid-tooltip/types";
import type { PropertyRow } from "../../types";
import type { ClosedDataType } from "@blockprotocol/type-system";
import type {
  CustomCell,
  ProvideEditorComponent,
} from "@glideapps/glide-data-grid";

export interface ValueCellProps extends TooltipCellProps {
  readonly kind: "value-cell";
  propertyRow: PropertyRow;
  readonly: boolean;
  showTypePicker?: boolean;
}

export type ValueCell = CustomCell<ValueCellProps>;

export type EditorType = "boolean" | "null" | "number" | "object" | "string";

export type OnTypeChange = (dataType: ClosedDataType) => void;

export type ValueCellEditorComponent = ProvideEditorComponent<ValueCell>;
