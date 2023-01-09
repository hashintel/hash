import produce from "immer";
import { useState } from "react";

import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { isValueEmpty } from "../../../is-value-empty";
import { EditorTypePicker } from "./editor-type-picker";
import { BooleanInput } from "./inputs/boolean-input";
import { NumberOrTextInput } from "./inputs/number-or-text-input";
import { EditorType, ValueCellEditorComponent } from "./types";
import {
  guessEditorTypeFromExpectedType,
  guessEditorTypeFromValue,
} from "./utils";

export const SingleValueEditor: ValueCellEditorComponent = (props) => {
  const { value: cell, onChange } = props;
  const { expectedTypes, value } = cell.data.propertyRow;

  const [editorType, setEditorType] = useState<EditorType | null>(() => {
    // if there are multiple expected types
    if (expectedTypes.length > 1) {
      // show type picker if value is empty, guess editor type using value if it's not
      return isValueEmpty(value)
        ? null
        : guessEditorTypeFromValue(value, expectedTypes);
    }

    const expectedType = expectedTypes[0];

    if (!expectedType) {
      throw new Error("there is no expectedType found on property type");
    }

    // if the value is empty, guess the editor type from expected type
    if (isValueEmpty(value)) {
      return guessEditorTypeFromExpectedType(expectedType);
    }

    // if the value is not empty, guess the editor type using value
    return guessEditorTypeFromValue(value, expectedTypes);
  });

  if (!editorType) {
    return (
      <GridEditorWrapper>
        <EditorTypePicker
          expectedTypes={expectedTypes}
          onTypeChange={setEditorType}
        />
      </GridEditorWrapper>
    );
  }

  if (editorType === "boolean") {
    return (
      <GridEditorWrapper sx={{ px: 2, alignItems: "flex-start" }}>
        <BooleanInput
          showChange
          value={!!value}
          onChange={(newValue) => {
            const newCell = produce(cell, (draftCell) => {
              draftCell.data.propertyRow.value = newValue;
            });

            onChange(newCell);
          }}
        />
      </GridEditorWrapper>
    );
  }

  const isNumber = editorType === "number";

  return (
    <GridEditorWrapper sx={{ px: 2 }}>
      <NumberOrTextInput
        isNumber={isNumber}
        /** we prevent passing `undefined` as value by using `??` operators here */
        value={isNumber ? ((value ?? 0) as number) : ((value ?? "") as string)}
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
