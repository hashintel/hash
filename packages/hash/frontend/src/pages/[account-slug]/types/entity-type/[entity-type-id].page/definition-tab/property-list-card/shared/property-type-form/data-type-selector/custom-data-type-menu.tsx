import { faClose, faList } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  Chip,
  ChipProps,
  FontAwesomeIcon,
} from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/ontology-types";
import {
  Box,
  buttonClasses,
  chipClasses,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { uniqueId } from "lodash";
import { FunctionComponent } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { faCube } from "../../../../../../../../../../shared/icons/pro/fa-cube";
import {
  ArrayType,
  ExpectedValue,
  getDefaultData,
  PropertyTypeFormValues,
} from "../../property-type-form-values";
import { dataTypeOptions } from "../shared/data-type-options";
import { useDataTypeSelectorDropdownContext } from "../shared/data-type-selector-dropdown-context";
import { ArrayDataTypeMenu } from "./custom-data-type-menu/array-data-type-menu";

const CustomChip: FunctionComponent<ChipProps & { borderColor?: string }> = ({
  borderColor,
  ...props
}) => (
  <Chip
    {...props}
    sx={{
      borderColor: borderColor ?? "transparent",
      [`.${chipClasses.label}`]: { paddingX: 1, paddingY: 0.25, fontSize: 11 },
    }}
  />
);

type CustomDataTypeMenuProps = {
  closeMenu: () => void;
};

export const CustomDataTypeMenu: FunctionComponent<CustomDataTypeMenuProps> = ({
  closeMenu,
}) => {
  const { closeCustomDataTypeMenu } = useDataTypeSelectorDropdownContext();

  const { getValues, setValue, control } =
    useFormContext<PropertyTypeFormValues>();

  const customDataTypeId = useWatch({ control, name: "customDataTypeId" });

  const editingDataTypeIndex = useWatch({
    control,
    name: "editingDataTypeIndex",
  });

  return (
    <Box>
      <Stack
        sx={({ palette }) => ({
          background: palette.gray[10],
          border: `1px solid ${palette.gray[30]}`,
          borderTopRightRadius: 4,
          borderTopLeftRadius: 4,
          paddingX: 2.75,
          paddingY: 2,
          borderBottomWidth: 0,
        })}
      >
        <Stack direction="row" justifyContent="space-between">
          <Stack direction="row" gap={1} alignItems="center">
            <Typography
              variant="smallCaps"
              sx={{ color: ({ palette }) => palette.gray[70] }}
            >
              Specify a custom expected value
            </Typography>
            <Tooltip
              title="Custom expected values can be useful when working with data ingested from external sources."
              placement="top"
            >
              <FontAwesomeIcon
                icon={faCircleQuestion}
                sx={{ fontSize: 12, color: ({ palette }) => palette.gray[40] }}
              />
            </Tooltip>
          </Stack>

          <Button
            onClick={closeMenu}
            sx={({ palette, transitions }) => ({
              padding: 0,
              minWidth: 0,
              minHeight: 0,
              height: 18,
              background: "none !important",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: "0.04em",
              color: palette.gray[50],
              [`.${buttonClasses.endIcon}`]: {
                color: palette.gray[40],
                ml: 0.5,
                fontSize: 16,
                transition: transitions.create("color"),
              },
            })}
            endIcon={<FontAwesomeIcon icon={faClose} />}
            variant="tertiary_quiet"
          >
            CANCEL
          </Button>
        </Stack>
        <Typography
          variant="smallTextLabels"
          sx={{ paddingTop: 1.25, color: ({ palette }) => palette.gray[70] }}
        >
          Advanced users can specify property objects as well as arrays of data
          types and/or property objects as expected values.
        </Typography>
      </Stack>

      <Stack
        gap={3}
        sx={({ palette }) => ({
          maxHeight: "40vh",
          overflow: "auto",
          paddingY: 2.25,
          paddingX: 1.5,
          background: palette.gray[20],
          border: `1px solid ${palette.gray[30]}`,
          ...(!customDataTypeId
            ? {
                borderBottomRightRadius: 4,
                borderBottomLeftRadius: 4,
              }
            : { borderBottomWidth: 0 }),
        })}
      >
        {!customDataTypeId ? (
          <>
            <Stack direction="row" gap={1.75}>
              <Button
                size="small"
                variant="tertiary"
                endIcon={<FontAwesomeIcon icon={{ icon: faCube }} />}
              >
                Create a property object
              </Button>
              <Stack gap={0.25}>
                <Typography
                  variant="smallTextLabels"
                  sx={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: ({ palette }) => palette.gray[60],
                  }}
                >
                  CONTAINS
                </Typography>
                <CustomChip
                  color="purple"
                  label="PROPERTY TYPES"
                  borderColor="#FFF"
                />
              </Stack>
            </Stack>

            <Stack direction="row" gap={1.75}>
              <Button
                size="small"
                variant="tertiary"
                endIcon={<FontAwesomeIcon icon={faList} />}
                onClick={() => {
                  const id = uniqueId();

                  setValue("customDataTypeId", id);
                  setValue("flattenedDataTypeList", {
                    [id]: {
                      id,
                      data: getDefaultData("array"),
                    },
                  });
                }}
              >
                Create an array
              </Button>
              <Stack gap={0.25}>
                <Typography
                  variant="smallTextLabels"
                  sx={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: ({ palette }) => palette.gray[60],
                  }}
                >
                  ALLOWS COMBINING
                </Typography>
                <Stack direction="row" gap={1}>
                  <CustomChip color="purple" label="PROPERTY OBJECTS" />
                  <CustomChip color="blue" label="DATA TYPES" />
                  <CustomChip color="navy" label="ARRAYS" />
                </Stack>
              </Stack>
            </Stack>
          </>
        ) : (
          <ArrayDataTypeMenu dataTypeId={customDataTypeId} />
        )}
      </Stack>

      {customDataTypeId ? (
        <Box
          sx={({ palette }) => ({
            background: palette.gray[10],
            paddingY: 2,
            paddingX: 1.5,
            border: `1px solid ${palette.gray[30]}`,
            borderBottomRightRadius: 4,
            borderBottomLeftRadius: 4,
          })}
        >
          <Button
            size="small"
            onClick={() => {
              const flattenedDataTypes = getValues("flattenedDataTypeList");
              const dataType = flattenedDataTypes[customDataTypeId];

              if (dataType?.data && "expectedValues" in dataType.data) {
                const containsArray = dataType.data.expectedValues.some(
                  (childId) => {
                    const typeId = flattenedDataTypes[childId]?.data?.typeId!;
                    return typeId === "array";
                  },
                );

                const containsObject = dataType.data.expectedValues.some(
                  (childId) =>
                    flattenedDataTypes[childId]?.data?.typeId ===
                    types.dataType.object.dataTypeId,
                );

                const containsDataType = dataType.data.expectedValues.some(
                  (childId) => {
                    const typeId = flattenedDataTypes[childId]?.data?.typeId!;
                    return (
                      typeId !== "array" && dataTypeOptions.includes(typeId)
                    );
                  },
                );

                let arrayType: ArrayType;
                if (containsArray && !containsObject && !containsDataType) {
                  arrayType = ArrayType.arrayArray;
                } else if (
                  containsObject &&
                  !containsArray &&
                  !containsDataType
                ) {
                  arrayType = ArrayType.propertyObjectArray;
                } else if (
                  containsDataType &&
                  !containsArray &&
                  !containsObject
                ) {
                  arrayType = ArrayType.dataTypeArray;
                } else {
                  arrayType = ArrayType.mixedArray;
                }

                const expectedValue: ExpectedValue = {
                  typeId: "array",
                  arrayType,
                  id: customDataTypeId,
                  flattenedDataTypes,
                };

                const newExpectedValues = [...getValues("expectedValues")];
                if (editingDataTypeIndex !== undefined) {
                  newExpectedValues[editingDataTypeIndex] = expectedValue;
                } else {
                  newExpectedValues.push(expectedValue);
                }
                setValue(`expectedValues`, newExpectedValues);
              }

              closeCustomDataTypeMenu();
            }}
          >
            Save expected value
          </Button>
        </Box>
      ) : null}
    </Box>
  );
};
