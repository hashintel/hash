import { faList } from "@fortawesome/free-solid-svg-icons";
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
import { faCube } from "../../../../shared/icons/pro/fa-cube";
import { PropertyTypeFormValues } from "./property-type-form";
import {
  DataType,
  propertyTypeDataTypes as primitiveDataTypes,
} from "./property-type-utils";

export const arrayPropertyDataType: DataType = {
  title: "Array",
  icon: faList.icon,
  dataTypeId: types.dataType.object.dataTypeId,
  data: {
    expectedValues: [],
    minItems: 0,
    maxItems: 0,
  },
};

export const objectPropertyDataType: DataType = {
  title: "Property Object",
  icon: faCube,
  data: {
    typeId: types.dataType.object.dataTypeId,
  },
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
    name: `flattenedCreatingProperties`,
  });

  const expectedValues = useWatch({
    control,
    name: `flattenedCreatingProperties.${id}.data.expectedValues`,
  });

  const children = useMemo(
    () =>
      expectedValues?.map((childId) => ({
        ...flattenedProperties[childId],
        id: childId,
      })),
    [flattenedProperties, expectedValues],
  );

  const propertyTypeDataTypes = useMemo(
    () => [
      ...primitiveDataTypes,
      arrayPropertyDataType,
      objectPropertyDataType,
    ],
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
        {children?.map((expectedValue, pos) =>
          expectedValue?.title === "Array" ? (
            <ArrayPropertyTypeMenu
              id={expectedValue.id}
              index={[...index, pos]}
            />
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
                {expectedValue?.title}
              </Typography>
            </Stack>
          ),
        )}

        <Autocomplete
          multiple
          popupIcon={null}
          clearIcon={null}
          forcePopupIcon={false}
          selectOnFocus={false}
          openOnFocus
          clearOnBlur={false}
          onChange={(_evt, data, reason, details) => {
            console.log(_evt);
            console.log(data);
            console.log(reason);
            console.log(details);

            const newProperty = details?.option;
            if (newProperty) {
              if (reason === "selectOption") {
                const childId = uniqueId();

                setValue(`flattenedCreatingProperties`, {
                  ...(flattenedProperties ?? {}),
                  [childId]: { ...newProperty, parentId: id },
                });
                setValue(
                  `flattenedCreatingProperties.${id}.data.expectedValues`,
                  [...expectedValues, childId],
                );
              } else if (reason === "removeOption") {
                // setValue(`flattenedCreatingProperties`, {
                //   ...(flattenedProperties ?? {}),
                //   [childId]: { ...newProperty, parentId: id },
                // });
                // // setValue(
                //   `flattenedCreatingProperties.${id}.data.expectedValues`,
                //   [...expectedValues, childId],
                // );
              }
            }
            // const childProperties: Record<string, DataType> =
            //   flattenedProperties;
            // const childPropertyIds = [];

            // const deletePropertyAndChildren = (
            //   deleteIds: string[],
            //   properties: Record<string, DataType>,
            // ) => {
            //   let props = properties;
            //   for (const deleteId of deleteIds) {
            //     const childData = properties[deleteId]?.data;

            //     delete props[deleteId];

            //     if (childData && "expectedValues" in childData) {
            //       props = deletePropertyAndChildren(
            //         childData.expectedValues,
            //         properties,
            //       );
            //     }
            //   }

            //   return props;
            //   // for (const propertyId in childProperties) {
            // };

            // // for (const propertyId in childProperties) {
            // //   if (expectedValues.includes(propertyId)) {
            // //     delete childProperties[propertyId];
            // //   }
            // // }

            // const filtered = deletePropertyAndChildren(
            //   expectedValues,
            //   childProperties,
            // );

            // for (const dataType of data) {
            //   const childId = uniqueId();

            //   childPropertyIds.push(childId);
            //   // filtered[childId] = { ...dataType, parentId: id };
            //   filtered[childId] = dataType;
            // }

            // setValue(`flattenedCreatingProperties`, {
            //   ...(flattenedProperties ?? {}),
            //   ...childProperties,
            // });
            // setValue(
            //   `flattenedCreatingProperties.${id}.data.expectedValues`,
            //   childPropertyIds,
            // );
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
          options={propertyTypeDataTypes}
          getOptionLabel={(obj) => obj.title}
          renderOption={(optProps, opt) => {
            return (
              <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
                <FontAwesomeIcon
                  icon={{ icon: opt.icon }}
                  sx={(theme) => ({ color: theme.palette.gray[50] })}
                />
                <Typography
                  variant="smallTextLabels"
                  component="span"
                  ml={1.5}
                  color={(theme) => theme.palette.gray[80]}
                >
                  {opt.title}
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
