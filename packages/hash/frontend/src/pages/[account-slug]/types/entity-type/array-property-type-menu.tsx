import {
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/types";
import { Autocomplete, Box, Stack, Typography } from "@mui/material";
import { uniqueId } from "lodash";
import { FunctionComponent, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { DataTypeBadge } from "./data-type-badge";
import { PropertyTypeFormValues } from "./property-type-form";
import {
  dataTypeOptions as primitiveDataTypeOptions,
  customDataTypeOptions,
  dataTypeData,
  getDefaultData,
  DataType,
} from "./property-type-utils";

const deleteDataTypeAndChildren = (
  id: string,
  properties: Record<string, DataType>,
) => {
  let newProperties = { ...properties };
  const removedProperty = properties[id];

  if (removedProperty) {
    if (removedProperty.data && "expectedValues" in removedProperty.data) {
      for (const childId of removedProperty.data.expectedValues) {
        newProperties = deleteDataTypeAndChildren(childId, newProperties);
      }
    }

    delete newProperties[removedProperty.id];
  }

  return newProperties;
};

type ArrayPropertyTypeMenuProps = {
  id: string;
  prefix?: string;
  deleteTooltip?: string;
  onDelete?: () => void;
  index?: number[];
};

export const ArrayPropertyTypeMenu: FunctionComponent<
  ArrayPropertyTypeMenuProps
> = ({ id, prefix, deleteTooltip, onDelete, index = [] }) => {
  const { setValue, control } = useFormContext<PropertyTypeFormValues>();

  const flattenedProperties = useWatch({
    control,
    name: `flattenedPropertyList`,
  });

  const expectedValues = useWatch({
    control,
    name: `flattenedPropertyList.${id}.data.expectedValues`,
  });

  const dataTypeOptions = useMemo(
    () => [...primitiveDataTypeOptions, ...customDataTypeOptions],
    [],
  );

  const deleteDataType = (typeId: string) => {
    const removedPropertyId = Object.values(flattenedProperties).find(
      (property) =>
        property.parentId === id && property.data?.typeId === typeId,
    )?.id;

    if (removedPropertyId) {
      setValue(
        `flattenedPropertyList`,
        deleteDataTypeAndChildren(removedPropertyId, flattenedProperties),
      );

      setValue(
        `flattenedPropertyList.${id}.data.expectedValues`,
        expectedValues.filter((childId) => childId !== removedPropertyId),
      );
    }
  };

  const value = useMemo(
    () =>
      expectedValues.map(
        (expectedValue) => flattenedProperties[expectedValue]?.data?.typeId,
      ),
    [expectedValues, flattenedProperties],
  );

  return (
    <Stack sx={{ mb: 1 }}>
      <DataTypeBadge
        typeId="array"
        prefix={prefix}
        deleteTooltip={deleteTooltip}
        onDelete={onDelete}
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
        {expectedValues?.map((childId, pos) => {
          const property = flattenedProperties[childId];

          if (!property?.data) {
            return null;
          }

          const isObject =
            property.data.typeId === types.dataType.object.dataTypeId;

          return (
            <Box key={property.data.typeId} mb={1}>
              {property.data.typeId === "array" ? (
                <ArrayPropertyTypeMenu
                  id={childId}
                  prefix={
                    expectedValues.length === 1 || pos === 0
                      ? "CONTAINING AN"
                      : "OR AN"
                  }
                  deleteTooltip={`Delete array${
                    property.data.expectedValues.length
                      ? " and its contents"
                      : ""
                  }`}
                  index={[...index, pos]}
                  onDelete={() =>
                    property.data?.typeId &&
                    deleteDataType(property.data.typeId)
                  }
                />
              ) : (
                <DataTypeBadge
                  typeId={property.data.typeId}
                  prefix={`${
                    expectedValues.length === 1
                      ? "CONTAINING"
                      : pos === 0
                      ? "CONTAINING EITHER"
                      : "OR"
                  }${isObject ? " A" : ""}`}
                  deleteTooltip="Remove data type"
                  onDelete={() =>
                    property.data?.typeId &&
                    deleteDataType(property.data.typeId)
                  }
                />
              )}
            </Box>
          );
        })}

        <Autocomplete
          value={value}
          multiple
          popupIcon={null}
          clearIcon={null}
          forcePopupIcon={false}
          selectOnFocus={false}
          openOnFocus
          clearOnBlur={false}
          onChange={(_evt, _data, reason, details) => {
            const typeId = details?.option;
            if (typeId) {
              const propertyData = getDefaultData(typeId);

              if (reason === "selectOption") {
                const childId = uniqueId();

                setValue(`flattenedPropertyList`, {
                  ...(flattenedProperties ?? {}),
                  [childId]: {
                    id: childId,
                    parentId: id,
                    data: propertyData,
                  },
                });
                setValue(`flattenedPropertyList.${id}.data.expectedValues`, [
                  ...expectedValues,
                  childId,
                ]);
              } else if (reason === "removeOption") {
                deleteDataType(typeId);
              }
            }
          }}
          renderTags={() => <Box />}
          renderInput={(inputProps) => (
            <TextField
              {...inputProps}
              sx={{
                alignSelf: "flex-start",
                width: "70%",
              }}
              placeholder="Select acceptable values"
            />
          )}
          options={dataTypeOptions}
          getOptionLabel={(opt) => dataTypeData[opt]!.title}
          renderOption={(optProps, opt) => {
            return (
              <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
                <FontAwesomeIcon
                  icon={{ icon: dataTypeData[opt]!.icon }}
                  sx={(theme) => ({ color: theme.palette.gray[50] })}
                />
                <Typography
                  variant="smallTextLabels"
                  component="span"
                  ml={1.5}
                  color={(theme) => theme.palette.gray[80]}
                >
                  {dataTypeData[opt]!.title}
                </Typography>
                <Chip color="blue" label="DATA TYPE" sx={{ ml: 1.5 }} />
              </Box>
            );
          }}
        />
      </Box>
    </Stack>
  );
};
