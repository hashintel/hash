import { faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/types";
import {
  Autocomplete,
  autocompleteClasses,
  Box,
  Collapse,
  inputBaseClasses,
  Stack,
  Typography,
} from "@mui/material";
import { uniqueId } from "lodash";
import { usePopupState } from "material-ui-popup-state/hooks";
import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  CustomExpectedValue,
  DefaultExpectedValueTypeId,
  getDefaultExpectedValue,
  PropertyTypeFormValues,
} from "../../../property-type-form-values";
import { dataTypeOptions as primitiveDataTypeOptions } from "../../shared/data-type-options";
import { expectedValuesOptions } from "../shared/expected-values-options";
import { ExpectedValueBadge } from "./array-expected-value-builder/expected-value-badge";
import { DeleteExpectedValueModal } from "./array-expected-value-builder/delete-expected-value-modal";

const dataTypeOptions: DefaultExpectedValueTypeId[] = [
  ...primitiveDataTypeOptions,
  "array",
  types.dataType.object.dataTypeId,
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

  const array = useWatch({
    control,
    name: `flattenedCustomExpectedValueList.${id}`,
  });

  useEffect(() => {
    setShow(true);
  }, []);

  if (!array?.data) {
    return null;
  }

  const isObject = array.data.typeId === types.dataType.object.dataTypeId;

  const hasContents = "itemIds" in array.data && array.data.itemIds.length;

  const deleteChild = () => {
    if (array.data?.typeId) {
      onDelete(array.data.typeId);
    }
  };

  return (
    <Collapse in={show && !array.animatingOut} timeout={300}>
      <Box mb={1}>
        {array.data.typeId === "array" ? (
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
        ) : (
          <ExpectedValueBadge
            typeId={array.data.typeId}
            prefix={`${
              onlyChild ? "CONTAINING" : firstChild ? "CONTAINING EITHER" : "OR"
            }${isObject ? " A" : ""}`}
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

  const [autocompleteElem, setAutocompleteElem] =
    useState<HTMLDivElement | null>(null);
  const textFieldRef = useRef<HTMLInputElement>(null);

  const [dataTypeCount, propertyObjectCount, arrayCount] = useMemo(() => {
    const arrays = itemIds.filter(
      (childId) => flattenedExpectedValues[childId]?.data?.typeId === "array",
    ).length;

    // TODO: change this to flattenedDataTypes[childId]?.data?.typeId === === "object"
    // when object creation is implemented
    const objects = itemIds.filter(
      (childId) =>
        flattenedExpectedValues[childId]?.data?.typeId ===
        types.dataType.object.dataTypeId,
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
        {itemIds?.map((itemId, pos) => (
          <ArrayExpectedValueChild
            key={itemId}
            id={itemId}
            index={[...index, pos]}
            onDelete={(typeId: string) => deleteExpectedValueById(typeId)}
            onlyChild={itemIds.length === 1}
            firstChild={pos === 0}
          />
        ))}

        <Autocomplete
          ref={(ref: HTMLDivElement) => setAutocompleteElem(ref)}
          value={value}
          multiple
          popupIcon={null}
          clearIcon={null}
          forcePopupIcon={false}
          selectOnFocus={false}
          openOnFocus
          componentsProps={{
            popper: {
              sx: {
                [`.${autocompleteClasses.paper}`]: {
                  width: autocompleteElem?.getBoundingClientRect().width,
                },
              },
            },
          }}
          clearOnBlur={false}
          onChange={(_evt, _data, reason, details) => {
            const typeId = details?.option;
            if (typeId) {
              const defaultData = getDefaultExpectedValue(typeId);

              if (reason === "selectOption") {
                const childId = uniqueId();

                setValue(`flattenedCustomExpectedValueList`, {
                  ...(flattenedExpectedValues ?? {}),
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
          renderTags={() => <Box />}
          renderInput={({ InputProps, ...otherProps }) => {
            const expanded =
              textFieldRef.current === document.activeElement ||
              textFieldRef.current?.value;

            return (
              <TextField
                {...otherProps}
                InputProps={{
                  ...InputProps,
                  inputRef: textFieldRef,
                  sx: ({ palette, transitions }) => ({
                    height: 42,
                    transition: transitions.create([
                      "width",
                      "background-color",
                    ]),
                    padding: "0 16px !important",
                    fill: palette.gray[50],

                    [`.${inputBaseClasses.input}`]: {
                      fontSize: "14px !important",
                      p: "0 !important",
                      ...(!expanded ? { cursor: "pointer !important" } : {}),
                    },

                    ...(!expanded
                      ? {
                          width: 145,
                          cursor: "pointer !important",
                          "&:hover": {
                            background: palette.gray[20],
                            fill: palette.gray[80],
                          },
                        }
                      : {}),

                    "& ::placeholder": {
                      paddingLeft: 0,
                      transition: transitions.create(["padding-left", "color"]),
                      ...(!expanded
                        ? {
                            paddingLeft: 0.5,
                            color: `${palette.gray[80]} !important`,
                            fontWeight: 500,
                          }
                        : {}),
                    },
                  }),
                  endAdornment: (
                    <FontAwesomeIcon
                      icon={expanded ? faSearch : faPlus}
                      sx={{
                        fontSize: 14,
                        marginLeft: 1,
                        marginRight: 0.5,
                        fill: "inherit",
                      }}
                    />
                  ),
                }}
                placeholder={
                  !expanded ? "Add to array" : "Select acceptable values"
                }
              />
            );
          }}
          options={dataTypeOptions}
          getOptionLabel={(opt) => expectedValuesOptions[opt!]!.title}
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
        />

        <DeleteExpectedValueModal
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
