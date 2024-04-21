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
import type { EditorType, ValueCell, ValueCellEditorComponent } from "./types";
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

  /**
   * Force validation on the text input form.
   * If the form is valid or if the form has been unmounted, allow <Grid /> to handle click events again.
   */
  const validationHandler = () => {
    if (textInputFormRef.current) {
      textInputFormRef.current.requestSubmit();

      if (!textInputFormRef.current.checkValidity()) {
        return;
      }
    }

    /**
     * Update the value and clean up the validation handler in either of these scenarios:
     * 1. The form is valid
     * 2. The form has been unmounted and we can't check its validity – this happens if another grid cell is clicked
     *
     * If another grid cell is clicked, we cannot validate using the input and we may have an invalid value in the table.
     * The alternative is that clicking another cell wipes the value, which is slightly worse UX.
     * Ideally we would prevent the form being closed when another cell is clicked, to allow validation to run,
     * and in any case have an indicator that an invalid value is in the form – tracked in H-1834
     */
    onFinishedEditing(latestValueCellRef.current);
    document.removeEventListener("click", validationHandler);
    document.body.classList.remove(GRID_CLICK_IGNORE_CLASS);

    return true;
  };

  /**
   * Glide Grid will close the editing interface when it is clicked outside.
   * We need to prevent that behavior by adding the GRID_CLICK_IGNORE_CLASS to the body,
   * and only permitting it when the form is valid.
   * This does not catch clicks on other cells, because the form is unmounted before validation can run.
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
              ("format" in expectedType &&
                expectedType.format &&
                /**
                 * We use the native browser date/time inputs which handle validation for us,
                 * and the validation click handler assumes there will be a click outside after a change
                 * - which there won't for those inputs, because clicking to select a value closes the input.
                 */
                !["date", "date-time", "time"].includes(expectedType.format)) ||
              "minLength" in expectedType ||
              "maxLength" in expectedType ||
              "minimum" in expectedType ||
              "maximum" in expectedType ||
              "step" in expectedType
            ) {
              /**
               * Add the validation enforcer if there are any validation rules.
               * We don't add this if we know the user cannot input an invalid value (e.g. unconstrained string or number).
               * Adding the validation enforcer means clicking into another cell requires a second click to activate it,
               * so we don't want to add it unnecessarily.
               * Ideally we wouldn't need the click handler hacks to enforce validation, or have a different validation strategy –
               * especially given that the validation enforcement can be bypassed by clicking another cell – see H-1834.
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
