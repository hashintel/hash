import { faList } from "@fortawesome/free-solid-svg-icons";
import {
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { Autocomplete, Box, Stack, Typography } from "@mui/material";
import { uniqueId } from "lodash";
import { FunctionComponent, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { PropertyTypeFormValues } from "./property-type-form";
import {
  dataTypeOptions as primitiveDataTypeOptions,
  customDataTypeOptions,
  dataTypeData,
  getDefaultData,
  DataType,
} from "./property-type-utils";

const deletePropertyAndChildren = (
  id: string,
  properties: Record<string, DataType>,
) => {
  let newProperties = { ...properties };
  const removedProperty = properties[id];

  if (removedProperty) {
    if (removedProperty.data && "expectedValues" in removedProperty.data) {
      for (const childId of removedProperty.data.expectedValues) {
        newProperties = deletePropertyAndChildren(childId, newProperties);
      }
    }

    delete newProperties[removedProperty.id];
  }

  return newProperties;
};

type ArrayPropertyTypeMenuProps = {
  id: string;
  index?: number[];
};

export const ArrayPropertyTypeMenu: FunctionComponent<
  ArrayPropertyTypeMenuProps
> = ({ id, index = [] }) => {
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

  return (
    <Stack sx={{ mb: 1 }}>
      <Stack
        direction="row"
        sx={{
          flex: 1,
          background: ({ palette }) => palette.gray[70],
          borderTopRightRadius: 4,
          borderTopLeftRadius: 4,
          paddingY: 1,
          paddingX: 1.5,
          alignItems: "center",
        }}
      >
        <FontAwesomeIcon
          icon={faList}
          sx={{ color: ({ palette }) => palette.gray[40], marginRight: 1.5 }}
        />
        <Typography sx={{ color: ({ palette }) => palette.white }}>
          Array
        </Typography>
      </Stack>

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

          return property.data.typeId === "array" ? (
            <ArrayPropertyTypeMenu id={childId} index={[...index, pos]} />
          ) : (
            <Stack
              direction="row"
              sx={{
                flex: 1,
                background: ({ palette }) => palette.gray[70],
                borderRadius: 4,
                paddingY: 1,
                paddingX: 1.5,
                alignItems: "center",
                mb: 1,
              }}
            >
              <FontAwesomeIcon
                icon={faList}
                sx={{
                  color: ({ palette }) => palette.gray[40],
                  marginRight: 1.5,
                }}
              />
              <Typography sx={{ color: ({ palette }) => palette.white }}>
                {dataTypeData[property.data.typeId]?.title}
              </Typography>
            </Stack>
          );
        })}

        <Autocomplete
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
                const removedPropertyId = Object.values(
                  flattenedProperties,
                ).find(
                  (property) =>
                    property.parentId === id &&
                    property.data?.typeId === typeId,
                )?.id;

                if (removedPropertyId) {
                  setValue(
                    `flattenedPropertyList`,
                    deletePropertyAndChildren(
                      removedPropertyId,
                      flattenedProperties,
                    ),
                  );

                  setValue(
                    `flattenedPropertyList.${id}.data.expectedValues`,
                    expectedValues.filter(
                      (childId) => childId !== removedPropertyId,
                    ),
                  );
                }
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
