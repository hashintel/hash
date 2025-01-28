import { ReadonlyGridPopup } from "../../../../../../../../../shared/readonly-grid-popup";
import type { ValueCellEditorComponent } from "./types";

export const ReadonlyValueCellPopup: ValueCellEditorComponent = (props) => {
  const { value: cell } = props;
  const { value } = cell.data.propertyRow;

  return <ReadonlyGridPopup value={value} />;
};
