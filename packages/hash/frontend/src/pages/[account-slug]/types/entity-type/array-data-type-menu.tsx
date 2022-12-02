import {
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { Autocomplete, Box, Stack, Typography } from "@mui/material";
import { uniqueId } from "lodash";
import { FunctionComponent, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ArrayDataTypeChild } from "./array-data-type-child";
import { DataTypeBadge } from "./data-type-badge";
import { PropertyTypeFormValues } from "./property-type-form";
import {
  dataTypeOptions as primitiveDataTypeOptions,
  customDataTypeOptions,
  dataTypeData,
  getDefaultData,
  DataType,
} from "./property-type-utils";

const dataTypeOptions = [...primitiveDataTypeOptions, ...customDataTypeOptions];

const deleteDataTypeAndChildren = (
  id: string,
  dataTypes: Record<string, DataType>,
) => {
  let newDataTypes = { ...dataTypes };
  const removedDataType = dataTypes[id];

  if (removedDataType) {
    if (removedDataType.data && "expectedValues" in removedDataType.data) {
      for (const childId of removedDataType.data.expectedValues) {
        newDataTypes = deleteDataTypeAndChildren(childId, newDataTypes);
      }
    }

    delete newDataTypes[removedDataType.id];
  }

  return newDataTypes;
};

type ArrayDataTypeMenuProps = {
  dataTypeId: string;
  prefix?: string;
  deleteTooltip?: string;
  onDelete?: () => void;
  index?: number[];
};

export const ArrayDataTypeMenu: FunctionComponent<ArrayDataTypeMenuProps> = ({
  dataTypeId,
  prefix,
  deleteTooltip,
  onDelete,
  index = [],
}) => {
  const { setValue, control } = useFormContext<PropertyTypeFormValues>();

  const flattenedDataTypes = useWatch({
    control,
    name: `flattenedDataTypeList`,
  });

  const expectedValues = useWatch({
    control,
    name: `flattenedDataTypeList.${dataTypeId}.data.expectedValues`,
  });

  const deleteDataTypeByTypeId = (typeId: string) => {
    const removedDataTypeId = Object.values(flattenedDataTypes).find(
      (dataType) =>
        dataType.parentId === dataTypeId && dataType.data?.typeId === typeId,
    )?.id;

    if (removedDataTypeId) {
      setValue(
        `flattenedDataTypeList`,
        deleteDataTypeAndChildren(removedDataTypeId, flattenedDataTypes),
      );

      setValue(
        `flattenedDataTypeList.${dataTypeId}.data.expectedValues`,
        expectedValues.filter((childId) => childId !== removedDataTypeId),
      );
    }
  };

  const value = useMemo(
    () =>
      expectedValues.map(
        (expectedValue) => flattenedDataTypes[expectedValue]?.data?.typeId,
      ),
    [expectedValues, flattenedDataTypes],
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
        {expectedValues?.map((childId, pos) => (
          <ArrayDataTypeChild
            key={childId}
            id={childId}
            index={[...index, pos]}
            onDelete={(typeId: string) => deleteDataTypeByTypeId(typeId)}
            onlyChild={expectedValues.length === 1}
            firstChild={pos === 0}
          />
        ))}

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
              const defaultData = getDefaultData(typeId);

              if (reason === "selectOption") {
                const childId = uniqueId();

                setValue(`flattenedDataTypeList`, {
                  ...(flattenedDataTypes ?? {}),
                  [childId]: {
                    id: childId,
                    parentId: dataTypeId,
                    data: defaultData,
                  },
                });
                setValue(
                  `flattenedDataTypeList.${dataTypeId}.data.expectedValues`,
                  [...expectedValues, childId],
                );
              } else if (reason === "removeOption") {
                deleteDataTypeByTypeId(typeId);
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
          getOptionLabel={(opt) => dataTypeData[opt!]!.title}
          renderOption={(optProps, opt) => {
            return (
              <Box component="li" {...optProps} sx={{ py: 1.5, px: 2.25 }}>
                <FontAwesomeIcon
                  icon={{ icon: dataTypeData[opt!]!.icon }}
                  sx={(theme) => ({ color: theme.palette.gray[50] })}
                />
                <Typography
                  variant="smallTextLabels"
                  component="span"
                  ml={1.5}
                  color={(theme) => theme.palette.gray[80]}
                >
                  {dataTypeData[opt!]!.title}
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
