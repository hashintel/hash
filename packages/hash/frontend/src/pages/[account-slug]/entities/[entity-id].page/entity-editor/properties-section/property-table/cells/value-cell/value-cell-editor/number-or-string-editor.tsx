import { TextField } from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/types";
import produce from "immer";
import { ValueCellEditorComponent } from "../types";

export const NumberOrStringEditor: ValueCellEditorComponent = ({
  value: cell,
  onChange,
}) => {
  const { value, dataTypes } = cell.data.property;
  /** @todo remove dataTypes[0] when multiple data types are supported */
  const isNumber = types.dataType.number.title === dataTypes[0];

  return (
    <TextField
      sx={{ my: "1px" }}
      autoFocus
      value={value}
      type={isNumber ? "number" : "text"}
      inputMode={isNumber ? "numeric" : "text"}
      onChange={({ target }) => {
        const newCell = produce(cell, (draftCell) => {
          const isEmptyString = target.value === "";

          const newValue =
            isNumber && !isEmptyString ? Number(target.value) : target.value;

          draftCell.data.property.value = newValue;
        });

        onChange(newCell);
      }}
    />
  );
};
