import { CustomCell, ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { TooltipCellProps } from "../../../../../../../../../components/GlideGlid/utils/use-grid-tooltip/types";
import { PropertyRow } from "../../types";

export interface ValueCellProps extends TooltipCellProps {
  readonly kind: "value-cell";
  property: PropertyRow;
}

export type ValueCell = CustomCell<ValueCellProps>;

export type ValueCellEditorProps = ProvideEditorComponent<ValueCell>;
