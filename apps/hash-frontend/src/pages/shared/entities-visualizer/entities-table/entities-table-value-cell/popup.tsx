import { ReadonlyGridPopup } from "../../../readonly-grid-popup";
import type { EntitiesTableValueCellEditorComponent } from "../entities-table-value-cell";

export const ReadonlyEntitiesTableValueCellPopup: EntitiesTableValueCellEditorComponent =
  (props) => {
    const { value: cell } = props;
    const { value } = cell.data;

    return <ReadonlyGridPopup minHeight="auto" value={value} />;
  };
