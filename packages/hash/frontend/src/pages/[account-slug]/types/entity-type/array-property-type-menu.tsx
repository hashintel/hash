import { faList } from "@fortawesome/free-solid-svg-icons";
import {
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/types";
import { Autocomplete, Box, Stack, Typography } from "@mui/material";
import { FunctionComponent, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { faCube } from "../../../../shared/icons/pro/fa-cube";
import {
  propertyTypeDataTypes as primitiveDataTypes,
  PropertyTypeFormValues,
} from "./property-type-form";

export const arrayPropertyDataType = {
  title: "Array",
  icon: faList.icon,
  dataTypeId: types.dataType.object.dataTypeId,
  data: {
    type: "array",
    expectedValues: [],
    minItems: 0,
    maxItems: 0,
  },
};

export const objectPropertyDataType = {
  title: "Property Object",
  icon: faCube,
  dataTypeId: types.dataType.object.dataTypeId,
  data: {},
};

type ArrayPropertyTypeMenuProps = {
  index?: number[];
};

export const ArrayPropertyTypeMenu: FunctionComponent<
  ArrayPropertyTypeMenuProps
> = ({ index = [] }) => {
  const { setValue, control } = useFormContext<PropertyTypeFormValues>();

  const path = `creatingProperty.data${index
    .map((pos) => `.expectedValues.${pos}.data`)
    .join("")}`;
  const property = useWatch({ control, name: path });

  const propertyTypeDataTypes = useMemo(
    () => [
      ...primitiveDataTypes,
      arrayPropertyDataType,
      objectPropertyDataType,
    ],
    [],
  );

  return (
    <Stack>
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
            palette.gray[index.length % 2 === 0 ? 20 : 10],
          borderBottomRightRadius: 4,
          borderBottomLeftRadius: 4,
          position: "relative",
        }}
      >
        {property?.expectedValues?.map((expectedValue, pos) =>
          expectedValue.title === "Array" ? (
            <ArrayPropertyTypeMenu index={[...index, pos]} />
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
                {expectedValue.title}
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
          onChange={(_evt, data) => {
            setValue(`${path}.expectedValues`, data);
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
