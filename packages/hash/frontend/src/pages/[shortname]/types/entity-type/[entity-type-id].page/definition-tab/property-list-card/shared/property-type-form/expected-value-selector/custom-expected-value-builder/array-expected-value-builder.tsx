import { Chip, FontAwesomeIcon } from "@hashintel/hash-design-system";
import {
  Box,
  Checkbox,
  checkboxClasses,
  Collapse,
  collapseClasses,
  Input,
  inputClasses,
  Stack,
  TextField,
  textFieldClasses,
  Theme,
  Typography,
} from "@mui/material";
import { uniqueId } from "lodash";
import { usePopupState } from "material-ui-popup-state/hooks";
import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";
import {
  CustomExpectedValue,
  DefaultExpectedValueTypeId,
  getDefaultExpectedValue,
  PropertyTypeFormValues,
} from "../../../property-type-form-values";
import { dataTypeOptions as primitiveDataTypeOptions } from "../../shared/data-type-options";
import { expectedValuesOptions } from "../shared/expected-values-options";
import { ExpectedValueBadge } from "../shared/expected-value-badge";
import { DeleteExpectedValueModal } from "../shared/delete-expected-value-modal";
import { CustomExpectedValueSelector } from "../shared/custom-expected-value-selector";
import { ObjectExpectedValueBuilder } from "../shared/object-expected-value-builder";

const dataTypeOptions: DefaultExpectedValueTypeId[] = [
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

  const { control } = useFormContext<PropertyTypeFormValues>();

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
  const { setValue, control } = useFormContext<PropertyTypeFormValues>();

  const flattenedExpectedValues = useWatch({
    control,
    name: `flattenedCustomExpectedValueList`,
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

  const minItemsController = useController({
    control,
    name: `flattenedCustomExpectedValueList.${expectedValueId}.data.minItems`,
  });
  const maxItemsController = useController({
    control,
    name: `flattenedCustomExpectedValueList.${expectedValueId}.data.maxItems`,
  });
  const infinityController = useController({
    control,
    name: `flattenedCustomExpectedValueList.${expectedValueId}.data.infinity`,
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
            flattenedExpectedValues,
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

  const [minItemsWidth, setMinItemsWidth] = useState(0);
  const [maxItemsWidth, setMaxItemsWidth] = useState(0);
  const [hovered, setHovered] = useState(false);

  const maxItemsInputRef = useRef<HTMLInputElement | null>();

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
        endNode={
          <Box display="flex" gap={1.25}>
            <Box display="flex">
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  py: 0.25,
                  px: 1,
                  background: ({ palette }) => palette.gray[80],
                  borderBottomLeftRadius: 30,
                  borderTopLeftRadius: 30,
                }}
              >
                <Typography
                  variant="smallCaps"
                  sx={{
                    fontSize: 11,
                    color: ({ palette }) => palette.gray[30],
                  }}
                >
                  Min
                </Typography>
              </Box>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  py: 0.25,
                  px: 1,
                  pl: 0.75,
                  background: ({ palette }) => palette.gray[90],
                  borderBottomRightRadius: 30,
                  borderTopRightRadius: 30,
                }}
              >
                <Input
                  {...minItemsController.field}
                  onChange={(event) => {
                    setMinItemsWidth(event.target.value.length);
                    minItemsController.field.onChange(event);
                  }}
                  type="number"
                  sx={{
                    fontSize: 11,
                    height: 16,
                    color: (theme: Theme) => theme.palette.white,
                    mx: 0.25,
                    width: `${minItemsWidth || 1}ch`,

                    "::before": {
                      display: "none",
                    },
                    "::after": {
                      borderBottomStyle: "dotted",
                      borderBottomColor: "white",
                      borderBottomWidth: 1,
                    },

                    ":hover": {
                      "::after": {
                        transform: "scaleX(1) translateX(0)",
                      },
                    },

                    // <-- Hide number input default arrows -->
                    "& input[type=number]": {
                      "-moz-appearance": "textfield",
                    },
                    "& input[type=number]::-webkit-outer-spin-button": {
                      "-webkit-appearance": "none",
                      margin: 0,
                    },
                    "& input[type=number]::-webkit-inner-spin-button": {
                      "-webkit-appearance": "none",
                      margin: 0,
                    },
                    // <-- Hide number input default arrows -->
                  }}
                />
              </Box>
            </Box>

            <Box
              display="flex"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  py: 0.25,
                  px: 1,
                  background: ({ palette }) => palette.gray[80],
                  borderBottomLeftRadius: 30,
                  borderTopLeftRadius: 30,
                }}
              >
                <Typography
                  variant="smallCaps"
                  sx={{
                    fontSize: 11,
                    color: ({ palette }) => palette.gray[30],
                  }}
                >
                  Max
                </Typography>
              </Box>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  py: 0.25,
                  px: 1,
                  pl: 0.75,
                  background: ({ palette }) => palette.gray[90],
                  borderBottomRightRadius: 30,
                  borderTopRightRadius: 30,
                }}
              >
                <Collapse
                  orientation="horizontal"
                  in={hovered}
                  sx={{
                    [`.${collapseClasses.wrapperInner}`]: {
                      display: "flex",
                      alignItems: "center",
                    },
                  }}
                  collapsedSize={
                    infinityController.field.value
                      ? 0
                      : (maxItemsInputRef.current?.offsetWidth ?? 0) + 4
                  }
                >
                  <Box sx={{ fontSize: 11, width: `${maxItemsWidth}ch` }}>
                    <Input
                      {...maxItemsController.field}
                      inputRef={(ref: HTMLInputElement | null) => {
                        if (ref) {
                          setMaxItemsWidth(ref.value.length);
                        }
                      }}
                      disabled={infinityController.field.value}
                      onChange={(event) => {
                        setMaxItemsWidth(event.target.value.length);
                        maxItemsController.field.onChange(event);
                      }}
                      type="number"
                      sx={{
                        fontSize: 11,
                        height: 16,
                        color: (theme: Theme) => theme.palette.white,
                        width: `${maxItemsWidth}ch`,

                        "::before": {
                          display: "none",
                        },
                        "::after": {
                          borderBottomStyle: "dashed",
                          borderBottomColor: "white",
                          borderBottomWidth: 1,
                        },

                        ":hover": {
                          "::after": {
                            transform: "scaleX(1) translateX(0)",
                          },
                        },

                        // <-- Hide number input default arrows -->
                        "& input[type=number]": {
                          "-moz-appearance": "textfield",
                        },
                        "& input[type=number]::-webkit-outer-spin-button": {
                          "-webkit-appearance": "none",
                          margin: 0,
                        },
                        "& input[type=number]::-webkit-inner-spin-button": {
                          "-webkit-appearance": "none",
                          margin: 0,
                        },
                        // <-- Hide number input default arrows -->
                      }}
                    />
                  </Box>
                  <Typography
                    variant="smallTextLabels"
                    sx={{
                      pl: 0.5,
                      fontSize: 11,
                      color: ({ palette }) => palette.white,
                      whiteSpace: "nowrap",
                      pr: 0.5,
                    }}
                  >
                    or allow
                  </Typography>
                </Collapse>
                <Collapse
                  orientation="horizontal"
                  in={hovered}
                  sx={{
                    [`.${collapseClasses.wrapperInner}`]: {
                      display: "flex",
                      alignItems: "center",
                    },
                  }}
                  collapsedSize={infinityController.field.value ? 12 : 0}
                >
                  <Typography
                    variant="smallTextLabels"
                    sx={{
                      // pl: 0.5,
                      fontSize: 11,
                      color: ({ palette }) => palette.white,
                      whiteSpace: "nowrap",
                    }}
                  >
                    ∞
                    <Checkbox
                      {...infinityController.field}
                      sx={{
                        ml: 0.5,
                        width: 12,
                        height: 12,
                        "&, > svg": { fontSize: 12 },
                      }}
                      size="small"
                    />
                  </Typography>
                </Collapse>
              </Box>
            </Box>
          </Box>
        }
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
                  ...flattenedExpectedValues,
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
