import { Chip } from "@local/design-system";
import produce from "immer";
import { useState } from "react";

import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { isValueEmpty } from "../../../is-value-empty";
import { editorSpecs } from "./editor-specs";
import { EditorTypePicker } from "./editor-type-picker";
import { BooleanInput } from "./inputs/boolean-input";
import { JsonInput } from "./inputs/json-input";
import { NumberOrTextInput } from "./inputs/number-or-text-input";
import { EditorType, ValueCellEditorComponent } from "./types";
import {
  guessEditorTypeFromExpectedType,
  guessEditorTypeFromValue,
} from "./utils";

export const SingleValueEditor: ValueCellEditorComponent = (props) => {
  const { value: cell, onChange, onFinishedEditing } = props;
  const { expectedTypes, value } = cell.data.propertyRow;

  const [editorType, setEditorType] = useState<EditorType | null>(() => {
    // if there are multiple expected types
    if (expectedTypes.length > 1) {
      // show type picker if value is empty, guess editor type using value if it's not
      const guessedEditorType = guessEditorTypeFromValue(value, expectedTypes);

      if (guessedEditorType === "null" || guessedEditorType === "emptyList") {
        return guessedEditorType;
      }

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

  if (editorType === "object") {
    return (
      <JsonInput
        value={value as any}
        onChange={(newValue, isDiscarded) => {
          if (isDiscarded) {
            return onFinishedEditing(undefined);
          }

          const newCell = produce(cell, (draftCell) => {
            draftCell.data.propertyRow.value = newValue;
          });

          onFinishedEditing(newCell);
        }}
      />
    );
  }

  if (editorType === "null" || editorType === "emptyList") {
    const spec = editorSpecs[editorType];
    const title = spec.valueToString(value);

    return (
      <GridEditorWrapper sx={{ px: 2, alignItems: "flex-start" }}>
        <Chip
          onClick={() => {
            if (value !== undefined) {
              return onFinishedEditing(undefined);
            }

            const newCell = produce(cell, (draftCell) => {
              draftCell.data.propertyRow.value = spec.defaultValue;
            });

            onFinishedEditing(newCell);
          }}
          label={title}
        />
      </GridEditorWrapper>
    );
  }

  return (
    <GridEditorWrapper sx={{ px: 2 }}>
      <NumberOrTextInput
        isNumber={editorType === "number"}
        value={(value as number | string | undefined) ?? ""}
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
