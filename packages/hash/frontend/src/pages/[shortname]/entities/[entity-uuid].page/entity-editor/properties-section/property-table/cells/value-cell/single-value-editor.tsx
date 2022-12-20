import { types } from "@hashintel/hash-shared/ontology-types";
import produce from "immer";
import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { BooleanInput } from "./inputs/boolean-input";
import { NumberOrTextInput } from "./inputs/number-or-text-input";
import { ValueCellEditorComponent } from "./types";

export const SingleValueEditor: ValueCellEditorComponent = (props) => {
  const { value: cell, onFinishedEditing, onChange } = props;
  const { expectedTypes, value } = cell.data.propertyRow;

  /** @todo remove expectedTypes[0] when multiple data types are supported */
  const isBoolean = expectedTypes[0] === types.dataType.boolean.title;

  if (isBoolean) {
    return (
      <BooleanInput
        value={!!value}
        onChange={(newValue) => {
          const newCell = produce(cell, (draftCell) => {
            draftCell.data.propertyRow.value = newValue;
          });

          onFinishedEditing(newCell);
        }}
      />
    );
  }

  /** @todo remove expectedTypes[0] when multiple data types are supported */
  const isNumber = expectedTypes[0] === types.dataType.number.title;

  return (
    <GridEditorWrapper sx={{ px: 2 }}>
      <NumberOrTextInput
        isNumber={isNumber}
        value={value as string | number}
        onChange={(newValue) => {
          const newCell = produce(cell, (draftCell) => {
            draftCell.data.propertyRow.value = newValue;
          });

          onChange(newCell);
        }}
      />
    </GridEditorWrapper>
  );
};
