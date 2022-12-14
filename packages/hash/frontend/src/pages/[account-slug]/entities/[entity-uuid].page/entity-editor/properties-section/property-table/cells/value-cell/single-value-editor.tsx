import { types } from "@hashintel/hash-shared/ontology-types";
import { Box, experimental_sx as sx, styled } from "@mui/material";
import produce from "immer";
import { BooleanInput } from "./inputs/boolean-input";
import { NumberOrStringInput } from "./inputs/number-or-string-input";
import { ValueCellEditorComponent } from "./types";

/**
 * @todo the border styles here are repetitive, make them reusable
 */
const SEditorWrapper = styled(Box)(({ theme }) =>
  sx({
    border: "1px solid",
    borderColor: "gray.30",
    borderRadius: theme.borderRadii.lg,
    background: "white",
    height: 48,
    display: "flex",
    alignItems: "center",
    px: 2,
  }),
);

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
    <SEditorWrapper>
      <NumberOrStringInput
        isNumber={isNumber}
        value={value as string | number}
        onChange={(newValue) => {
          const newCell = produce(cell, (draftCell) => {
            draftCell.data.propertyRow.value = newValue;
          });

          onChange(newCell);
        }}
      />
    </SEditorWrapper>
  );
};
