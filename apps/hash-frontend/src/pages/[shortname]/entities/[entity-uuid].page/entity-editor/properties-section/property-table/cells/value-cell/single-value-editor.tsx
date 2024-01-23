import { Chip } from "@hashintel/design-system";
import { GRID_CLICK_IGNORE_CLASS } from "@hashintel/design-system/constants";
import { Box } from "@mui/material";
import produce from "immer";
import { useEffect, useRef, useState } from "react";

import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { isValueEmpty } from "../../../is-value-empty";
import { getEditorSpecs } from "./editor-specs";
import { EditorTypePicker } from "./editor-type-picker";
import { BooleanInput } from "./inputs/boolean-input";
import { JsonInput } from "./inputs/json-input";
import { NumberOrTextInput } from "./inputs/number-or-text-input";
import { EditorType, ValueCell, ValueCellEditorComponent } from "./types";
import {
  guessEditorTypeFromExpectedType,
  guessEditorTypeFromValue,
} from "./utils";

export const SingleValueEditor: ValueCellEditorComponent = (props) => {
  const { value: cell, onChange, onFinishedEditing } = props;
  const { expectedTypes, value } = cell.data.propertyRow;

  const textInputFormRef = useRef<HTMLFormElement>(null);

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

  const latestValueCellRef = useRef<ValueCell>(cell);
  useEffect(() => {
    latestValueCellRef.current = cell;
  });

  if (!editorType) {
    return (
      <GridEditorWrapper>
        <EditorTypePicker
          expectedTypes={expectedTypes}
          onTypeChange={(type) => {
            const editorSpec = getEditorSpecs(type);

            // if no edit mode supported for selected type, set the default value and close the editor
            if (editorSpec.arrayEditException === "no-edit-mode") {
              const newCell = produce(cell, (draftCell) => {
                draftCell.data.propertyRow.value = editorSpec.defaultValue;
              });

              return onFinishedEditing(newCell);
            }

            setEditorType(type);
          }}
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
        value={value}
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
    const spec = getEditorSpecs(editorType);
    const title = editorType === "null" ? "Null" : "Empty List";

    const shouldClearOnClick = value !== undefined;

    return (
      <GridEditorWrapper sx={{ px: 2, alignItems: "flex-start" }}>
        <Chip
          color={shouldClearOnClick ? "red" : "gray"}
          onClick={() => {
            const newCell = produce(cell, (draftCell) => {
              draftCell.data.propertyRow.value = shouldClearOnClick
                ? undefined
                : spec.defaultValue;
            });

            onFinishedEditing(newCell);
          }}
          label={title}
        />
      </GridEditorWrapper>
    );
  }

  const expectedType = expectedTypes.find((type) => type.type === editorType);
  if (!expectedType) {
    throw new Error(
      `Could not find guessed editor type ${editorType} among expected types ${expectedTypes
        .map((opt) => opt.$id)
        .join(", ")}`,
    );
  }

  const validationHandler = () => {
    if (!textInputFormRef.current) {
      return;
    }
    textInputFormRef.current.requestSubmit();
    if (textInputFormRef.current.checkValidity()) {
      document.body.classList.remove(GRID_CLICK_IGNORE_CLASS);
      onFinishedEditing(latestValueCellRef.current);
      document.removeEventListener("click", validationHandler);
    }
  };

  /**
   * Glide Grid will close the editing interface when it is clicked outside.
   * We need to prevent that behavior by adding the GRID_CLICK_IGNORE_CLASS to the body,
   * and only permitting it when the form is valid.
   */
  const ensureFormValidation = () => {
    if (document.body.classList.contains(GRID_CLICK_IGNORE_CLASS)) {
      return;
    }
    document.body.classList.add(GRID_CLICK_IGNORE_CLASS);
    document.addEventListener("click", validationHandler);
  };

  return (
    <GridEditorWrapper sx={{ px: 2 }}>
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
        }}
        ref={textInputFormRef}
      >
        <NumberOrTextInput
          expectedType={expectedType}
          isNumber={editorType === "number"}
          value={(value as number | string | undefined) ?? ""}
          onChange={(newValue) => {
            if (
              !(
                "format" in expectedType &&
                expectedType.format &&
                ["date", "date-time", "time"].includes(expectedType.format)
              )
            ) {
              /**
               * We use the native browser date/time inputs which handle validation for us,
               * and the validation click handler assumes there will be a click outside after a change
               * - which there won't for those inputs, because clicking to select a value closes the input.
               */
              ensureFormValidation();
            }

            const newCell = produce(cell, (draftCell) => {
              draftCell.data.propertyRow.value = newValue;
            });

            onChange(newCell);
          }}
          onEnterPressed={() => {
            validationHandler();
          }}
        />
      </Box>
    </GridEditorWrapper>
  );
};
