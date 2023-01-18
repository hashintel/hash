import { Chip, FontAwesomeIcon } from "@local/design-system";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { uniqueId } from "lodash";
import { usePopupState } from "material-ui-popup-state/hooks";
import { FunctionComponent, useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { dataTypeOptions as primitiveDataTypeOptions } from "../../../shared/data-type-options";
import { getDefaultExpectedValue } from "../../../shared/default-expected-value";
import {
  CustomExpectedValue,
  CustomExpectedValueTypeId,
} from "../../../shared/expected-value-types";
import { expectedValuesOptions } from "../../../shared/expected-values-options";
import { CustomExpectedValueSelector } from "../shared/custom-expected-value-selector";
import { DeleteExpectedValueModal } from "../shared/delete-expected-value-modal";
import { ExpectedValueBadge } from "../shared/expected-value-badge";
import { ExpectedValueSelectorFormValues } from "../shared/expected-value-selector-form-values";
import { ObjectExpectedValueBuilder } from "../shared/object-expected-value-builder";
import { ArrayMinMaxItems } from "./array-expected-value-builder/array-min-max-items";

const dataTypeOptions: CustomExpectedValueTypeId[] = [
  ...primitiveDataTypeOptions,
  "array",
  "object",
];

const deleteExpectedValueAndChildren = (
  id: string,
  expectedValues: Record<string, CustomExpectedValue>,
) => {
  let newExpectedValues = { ...expectedValues };
  const removedExpectedValue = expectedValues[id];

  if (removedExpectedValue) {
    if (removedExpectedValue.data && "itemIds" in removedExpectedValue.data) {
      for (const childId of removedExpectedValue.data.itemIds) {
        newExpectedValues = deleteExpectedValueAndChildren(
          childId,
          newExpectedValues,
        );
      }
    }

    delete newExpectedValues[removedExpectedValue.id];
  }

  return newExpectedValues;
};

type ArrayExpectedValueChildProps = {
  id: string;
  index?: number[];
  onlyChild?: boolean;
  firstChild?: boolean;
  onDelete: (typeId: string) => void;
};

const ArrayExpectedValueChild: FunctionComponent<
  ArrayExpectedValueChildProps
> = ({ id, index, onlyChild, firstChild, onDelete }) => {
  const [show, setShow] = useState(false);

  const { control } = useFormContext<ExpectedValueSelectorFormValues>();

  const arrayChild = useWatch({
    control,
    name: `flattenedCustomExpectedValueList.${id}`,
  });

  useEffect(() => {
    setShow(true);
  }, []);

  if (!arrayChild.data) {
    return null;
  }

  const hasContents =
    "itemIds" in arrayChild.data && arrayChild.data.itemIds.length;

  const deleteChild = () => {
    if (arrayChild.data?.typeId) {
      onDelete(arrayChild.data.typeId);
    }
  };

  return (
    <Collapse in={show && !arrayChild.animatingOut} timeout={300}>
      <Box mb={1}>
        {arrayChild.data.typeId === "array" ? (
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          <ArrayExpectedValueBuilder
            expectedValueId={id}
            prefix={firstChild ? "CONTAINING AN" : "OR AN"}
            deleteTooltip={`Delete array${
              hasContents ? " and its contents" : ""
            }`}
            index={index}
            onDelete={deleteChild}
          />
        ) : arrayChild.data.typeId === "object" ? (
          <ObjectExpectedValueBuilder
            expectedValueId={id}
            prefix={firstChild ? "CONTAINING A" : "OR A"}
            deleteTooltip={`Delete property object${
              hasContents ? " and its contents" : ""
            }`}
            index={index}
            onDelete={deleteChild}
          />
        ) : (
          <ExpectedValueBadge
            typeId={arrayChild.data.typeId}
            prefix={`${
              onlyChild ? "CONTAINING" : firstChild ? "CONTAINING EITHER" : "OR"
            }`}
            deleteTooltip="Remove data type"
            onDelete={deleteChild}
          />
        )}
      </Box>
    </Collapse>
  );
};

type ArrayExpectedValueBuilderProps = {
  expectedValueId: string;
  prefix?: string;
  deleteTooltip?: string;
  onDelete?: () => void;
  index?: number[];
};

export const ArrayExpectedValueBuilder: FunctionComponent<
  ArrayExpectedValueBuilderProps
> = ({ expectedValueId, prefix, deleteTooltip, onDelete, index = [] }) => {
  const { getValues, setValue, control } =
    useFormContext<ExpectedValueSelectorFormValues>();

  const [flattenedExpectedValues, editingExpectedValueIndex] = useWatch({
    control,
    name: [`flattenedCustomExpectedValueList`, `editingExpectedValueIndex`],
  });

  const itemIds = useWatch({
    control,
    name: `flattenedCustomExpectedValueList.${expectedValueId}.data.itemIds`,
  });

  const [dataTypeCount, propertyObjectCount, arrayCount] = useMemo(() => {
    const arrays = itemIds.filter(
      (childId) => flattenedExpectedValues[childId]?.data?.typeId === "array",
    ).length;

    const objects = itemIds.filter(
      (childId) => flattenedExpectedValues[childId]?.data?.typeId === "object",
    ).length;

    const dataTypes = itemIds.length - arrays - objects;

    return [dataTypes, objects, arrays];
  }, [itemIds, flattenedExpectedValues]);

  const deleteModalPopupState = usePopupState({
    variant: "popover",
    popupId: `deleteArray-${expectedValueId}`,
  });

  const deleteExpectedValueById = (typeId: string) => {
    const removedExpectedValue = Object.values(flattenedExpectedValues).find(
      (expectedValue) =>
        expectedValue.parentId === expectedValueId &&
        expectedValue.data?.typeId === typeId,
    );

    if (removedExpectedValue) {
      const removedExpectedValueId = removedExpectedValue.id;
      setValue(`flattenedCustomExpectedValueList.${removedExpectedValueId}`, {
        ...removedExpectedValue,
        animatingOut: true,
      });

      setTimeout(() => {
        setValue(
          `flattenedCustomExpectedValueList`,
          deleteExpectedValueAndChildren(
            removedExpectedValueId,
            getValues("flattenedCustomExpectedValueList"),
          ),
        );

        setValue(
          `flattenedCustomExpectedValueList.${expectedValueId}.data.itemIds`,
          itemIds.filter((childId) => childId !== removedExpectedValueId),
        );
      }, 300);
    }

    // trigger popper reposition calculation
    window.dispatchEvent(new Event("resize"));
  };

  const value = useMemo(
    () =>
      itemIds.map((itemId) => flattenedExpectedValues[itemId]?.data?.typeId),
    [itemIds, flattenedExpectedValues],
  );

  return (
    <Stack sx={{ mb: 1 }}>
      <ExpectedValueBadge
        typeId="array"
        prefix={prefix}
        deleteTooltip={deleteTooltip}
        onDelete={() => {
          if (dataTypeCount + arrayCount + propertyObjectCount > 0) {
            deleteModalPopupState.open();
          } else {
            onDelete?.();
          }
        }}
        endNode={<ArrayMinMaxItems arrayId={expectedValueId} />}
      />

      <Box
        sx={{
          padding: 1.5,
          flex: 1,
          background: ({ palette }) =>
            palette.gray[index.length % 2 !== 0 ? 20 : 10],
          borderBottomRightRadius: 4,
          borderBottomLeftRadius: 4,
          position: "relative",
        }}
      >
        {itemIds.map((itemId, pos) => (
          <ArrayExpectedValueChild
            key={itemId}
            id={itemId}
            index={[...index, pos]}
            onDelete={(typeId: string) => deleteExpectedValueById(typeId)}
            onlyChild={itemIds.length === 1}
            firstChild={pos === 0}
          />
        ))}

        <CustomExpectedValueSelector
          inputLabel="Add to array"
          collapsedWidth={145}
          value={value}
          options={dataTypeOptions}
          renderOption={(optProps, opt) => {
            return (
              <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
                <FontAwesomeIcon
                  icon={{ icon: expectedValuesOptions[opt!]!.icon }}
                  sx={(theme) => ({ color: theme.palette.gray[50] })}
                />
                <Typography
                  variant="smallTextLabels"
                  component="span"
                  ml={1.5}
                  color={(theme) => theme.palette.gray[80]}
                >
                  {expectedValuesOptions[opt!]!.title}
                </Typography>
                <Chip color="blue" label="DATA TYPE" sx={{ ml: 1.5 }} />
              </Box>
            );
          }}
          onChange={(_evt, _data, reason, details) => {
            const typeId = details?.option;
            if (typeId) {
              const allowMultiple =
                expectedValuesOptions[typeId]?.allowMultiple;

              const defaultData = getDefaultExpectedValue(typeId);

              if (
                reason === "selectOption" ||
                (reason === "removeOption" && allowMultiple)
              ) {
                const childId = uniqueId();

                setValue(`flattenedCustomExpectedValueList`, {
                  ...getValues("flattenedCustomExpectedValueList"),
                  [childId]: {
                    id: childId,
                    parentId: expectedValueId,
                    data: defaultData,
                  },
                });
                setValue(
                  `flattenedCustomExpectedValueList.${expectedValueId}.data.itemIds`,
                  [...itemIds, childId],
                );

                // trigger popper reposition calculation
                window.dispatchEvent(new Event("resize"));
              } else if (reason === "removeOption") {
                deleteExpectedValueById(typeId);
              }
            }
          }}
        />

        <DeleteExpectedValueModal
          expectedValueType="array"
          popupState={deleteModalPopupState}
          editing={editingExpectedValueIndex !== undefined && !index.length} // We only want to show the editing modal for the root array
          onDelete={onDelete}
          onClose={() => deleteModalPopupState.close()}
          dataTypeCount={dataTypeCount}
          arrayCount={arrayCount}
          propertyObjectCount={propertyObjectCount}
        />
      </Box>
    </Stack>
  );
};
