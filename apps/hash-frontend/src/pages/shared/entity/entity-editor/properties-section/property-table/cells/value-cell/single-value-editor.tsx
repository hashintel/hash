import { useQuery } from "@apollo/client";
import type {
  ClosedDataType,
  PropertyValueMetadata,
} from "@blockprotocol/type-system";
import { isValueMetadata } from "@blockprotocol/type-system";
import { Autocomplete, Chip } from "@hashintel/design-system";
import { GRID_CLICK_IGNORE_CLASS } from "@hashintel/design-system/constants";
import type { MergedDataTypeSingleSchema } from "@local/hash-isomorphic-utils/data-types";
import {
  createConversionFunction,
  getMergedDataTypeSchema,
} from "@local/hash-isomorphic-utils/data-types";
import { Box, outlinedInputClasses, Typography } from "@mui/material";
import { produce } from "immer";
import { useEffect, useRef, useState } from "react";

import type {
  FindDataTypeConversionTargetsQuery,
  FindDataTypeConversionTargetsQueryVariables,
} from "../../../../../../../../graphql/api-types.gen";
import { findDataTypeConversionTargetsQuery } from "../../../../../../../../graphql/queries/ontology/data-type.queries";
import { NumberOrTextInput } from "../../../../../../number-or-text-input";
import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import { getEditorSpecs } from "./editor-specs";
import { EditorTypePicker } from "./editor-type-picker";
import { BooleanInput } from "./inputs/boolean-input";
import { JsonInput } from "./inputs/json-input";
import type { ValueCell, ValueCellEditorComponent } from "./types";

export const SingleValueEditor: ValueCellEditorComponent = (props) => {
  const { value: cell, onChange, onFinishedEditing } = props;
  const {
    generateNewMetadataObject,
    permittedDataTypes,
    permittedDataTypesIncludingChildren,
    propertyKeyChain,
    value,
    valueMetadata,
  } = cell.data.propertyRow;

  const { showTypePicker } = cell.data;

  const textInputFormRef = useRef<HTMLFormElement>(null);

  const [chosenDataType, setChosenDataType] = useState<{
    dataType: ClosedDataType;
    schema: MergedDataTypeSingleSchema;
  } | null>(() => {
    if (
      permittedDataTypes.length === 1 &&
      !permittedDataTypes[0]!.schema.abstract
    ) {
      const dataType = permittedDataTypes[0]!;
      const schema = getMergedDataTypeSchema(dataType.schema);

      if ("anyOf" in schema) {
        /**
         * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
         */
        throw new Error(
          "Data types with different expected sets of constraints (anyOf) are not yet supported",
        );
      }

      return {
        dataType: dataType.schema,
        schema,
      };
    }

    if (!valueMetadata) {
      /**
       * We don't yet have a value set
       */
      return null;
    }

    if (!isValueMetadata(valueMetadata)) {
      throw new Error(
        `Expected single value metadata in SingleValueEditor, got ${JSON.stringify(valueMetadata)}`,
      );
    }

    const dataTypeId = valueMetadata.metadata.dataTypeId;

    const dataType = permittedDataTypesIncludingChildren.find(
      (type) => type.schema.$id === dataTypeId,
    );

    if (!dataType) {
      throw new Error(
        "Expected a data type to be set on the value or at least one permitted data type",
      );
    }

    const schema = getMergedDataTypeSchema(dataType.schema);

    if ("anyOf" in schema) {
      /**
       * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
       */
      throw new Error(
        "Data types with different expected sets of constraints (anyOf) are not yet supported",
      );
    }

    return {
      dataType: dataType.schema,
      schema,
    };
  });

  const { data } = useQuery<
    FindDataTypeConversionTargetsQuery,
    FindDataTypeConversionTargetsQueryVariables
  >(findDataTypeConversionTargetsQuery, {
    fetchPolicy: "cache-first",
    variables: {
      dataTypeIds: chosenDataType ? [chosenDataType.dataType.$id] : [],
    },
    skip: !chosenDataType || !showTypePicker,
  });

  const conversionTargetsById =
    chosenDataType &&
    data?.findDataTypeConversionTargets[chosenDataType.dataType.$id];

  useEffect(() => {
    if (
      chosenDataType &&
      (valueMetadata as PropertyValueMetadata | undefined)?.metadata
        .dataTypeId !== chosenDataType.dataType.$id
    ) {
      const { propertyMetadata } = generateNewMetadataObject({
        propertyKeyChain,
        valuePath: propertyKeyChain,
        valueMetadata: {
          metadata: {
            dataTypeId: chosenDataType.dataType.$id,
          },
        },
      });

      const newCell = produce(cell, (draftCell) => {
        draftCell.data.propertyRow.valueMetadata = propertyMetadata;
      });

      onChange(newCell);
    }
  }, [
    cell,
    chosenDataType,
    generateNewMetadataObject,
    onChange,
    propertyKeyChain,
    valueMetadata,
  ]);

  const latestValueCellRef = useRef<ValueCell>(cell);
  useEffect(() => {
    latestValueCellRef.current = cell;
  });

  if (
    !chosenDataType ||
    !cell.data.propertyRow.valueMetadata ||
    showTypePicker
  ) {
    return (
      <GridEditorWrapper>
        <EditorTypePicker
          expectedTypes={permittedDataTypes}
          onTypeChange={(type) => {
            const schema = getMergedDataTypeSchema(type);

            if ("anyOf" in schema) {
              /**
               * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
               */
              throw new Error(
                "Data types with different expected sets of constraints (anyOf) are not yet supported",
              );
            }

            const editorSpec = getEditorSpecs(type, schema);

            setChosenDataType({
              dataType: type,
              schema,
            });

            // if no edit mode supported for selected type, set the default value and close the editor
            if (editorSpec.arrayEditException === "no-edit-mode") {
              const newCell = produce(cell, (draftCell) => {
                draftCell.data.propertyRow.value = editorSpec.defaultValue;
                draftCell.data.propertyRow.valueMetadata = {
                  metadata: { dataTypeId: type.$id },
                };
                draftCell.data.showTypePicker = false;
              });

              onFinishedEditing(newCell);
            } else {
              const conversions =
                conversionTargetsById?.[type.$id]?.conversions;

              const newCell = produce(cell, (draftCell) => {
                draftCell.data.propertyRow.valueMetadata = {
                  metadata: { dataTypeId: type.$id },
                };
                draftCell.data.showTypePicker = false;

                if (conversions) {
                  const conversionFunction =
                    createConversionFunction(conversions);

                  // @ts-expect-error - things other than numbers are not yet convertible.
                  // we could throw an error if we find a non-number value, but this way it'll just start working when we add support.
                  // not handling a non-number case is only an issue if we add non-number conversions without updating createConversionFunction, which we are unlikely to do.
                  const newValue = conversionFunction(value);

                  draftCell.data.propertyRow.value = newValue;
                }
              });

              if (conversions) {
                /**
                 * If the user has switched between convertible data types, assume the usual case is that they don't need to edit it.
                 */
                onFinishedEditing(newCell);
                return;
              }

              onChange(newCell);
            }
          }}
          selectedDataTypeId={chosenDataType?.dataType.$id}
        />
      </GridEditorWrapper>
    );
  }

  const { schema } = chosenDataType;

  if (schema.type === "boolean") {
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

  if (schema.type === "object") {
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

  if (schema.type === "null") {
    const spec = getEditorSpecs(chosenDataType.dataType, chosenDataType.schema);
    const title = "Null";

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

  if ("enum" in schema) {
    if (!schema.enum) {
      throw new Error("schema.enum is undefined");
    }

    return (
      <GridEditorWrapper>
        <Autocomplete
          componentsProps={{
            paper: {
              className: GRID_CLICK_IGNORE_CLASS,
            },
          }}
          disableCloseOnSelect={false}
          options={schema.enum}
          inputProps={{
            endAdornment: <Box />,
            startAdornment: <Box />,
            sx: {
              [`&.${outlinedInputClasses.root}`]: {
                pr: 0,
                py: 0,
                "& input": {
                  fontSize: 14,
                },
              },
            },
          }}
          isOptionEqualToValue={(option, val) => option === val}
          value={value}
          onChange={(_event, newValue) => {
            const newCell = produce(cell, (draftCell) => {
              draftCell.data.propertyRow.value = newValue;
            });

            if (value === newValue) {
              onFinishedEditing();
              return;
            }

            onFinishedEditing(newCell);
          }}
          renderOption={({ key, ...itemProps }, item) => (
            <Box
              component="li"
              key={key}
              {...itemProps}
              className={GRID_CLICK_IGNORE_CLASS}
              sx={{
                cursor: item === "value" ? "default" : "pointer",
                px: 1,
                py: 1,
                background:
                  item === value ? ({ palette }) => palette.blue[15] : "none",
              }}
            >
              <Typography
                variant="smallTextParagraphs"
                sx={{
                  color: ({ palette }) => palette.gray[90],
                  fontSize: 14,
                }}
              >
                {String(item)}
              </Typography>
            </Box>
          )}
        />
      </GridEditorWrapper>
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
     * If another grid cell is clicked, we cannot validate using the input and we may have an invalid value in the
     * table. The alternative is that clicking another cell wipes the value, which is slightly worse UX. Ideally we
     * would prevent the form being closed when another cell is clicked, to allow validation to run, and in any case
     * have an indicator that an invalid value is in the form – tracked in H-1834
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
          multiLineText={schema.type === "string"}
          schema={schema}
          isNumber={schema.type === "number"}
          value={(value as number | string | undefined) ?? ""}
          onChange={(newValue) => {
            if (
              ("format" in schema &&
                schema.format &&
                /**
                 * We use the native browser date/time inputs which handle validation for us,
                 * and the validation click handler assumes there will be a click outside after a change
                 * - which there won't for those inputs, because clicking to select a value closes the input.
                 */
                !["date", "date-time", "time"].includes(schema.format)) ||
              "minLength" in schema ||
              "maxLength" in schema ||
              "minimum" in schema ||
              "maximum" in schema ||
              "step" in schema
            ) {
              /**
               * Add the validation enforcer if there are any validation rules.
               * We don't add this if we know the user cannot input an invalid value (e.g. unconstrained string or
               * number). Adding the validation enforcer means clicking into another cell requires a second click to
               * activate it, so we don't want to add it unnecessarily. Ideally we wouldn't need the click handler
               * hacks to enforce validation, or have a different validation strategy – especially given that the
               * validation enforcement can be bypassed by clicking another cell – see H-1834.
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
