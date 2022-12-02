import { faClose, faList } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  Chip,
  ChipProps,
  FontAwesomeIcon,
} from "@hashintel/hash-design-system";
import {
  Box,
  buttonClasses,
  chipClasses,
  Stack,
  Typography,
} from "@mui/material";
import { uniqueId } from "lodash";
import { FunctionComponent } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { faCube } from "../../../../shared/icons/pro/fa-cube";
import { ArrayPropertyTypeMenu } from "./array-property-type-menu";
import { PropertyTypeFormValues } from "./property-type-form";
import { usePropertyTypeSelectorDropdownContext } from "./property-type-selector-dropdown";
import { getDefaultData } from "./property-type-utils";

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

type CustomPropertyTypeMenuProps = {
  closeMenu: () => void;
};

export const CustomPropertyTypeMenu: FunctionComponent<
  CustomPropertyTypeMenuProps
> = ({ closeMenu }) => {
  const { closeCustomPropertyMenu } = usePropertyTypeSelectorDropdownContext();

  const { getValues, setValue, control } =
    useFormContext<PropertyTypeFormValues>();
  const creatingPropertyId = useWatch({ control, name: "creatingPropertyId" });

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
          <Typography
            variant="smallCaps"
            sx={{ color: ({ palette }) => palette.gray[70] }}
          >
            Specify a custom expected value
          </Typography>

          <Button
            onClick={closeMenu}
            sx={({ palette, transitions }) => ({
              padding: 0,
              minWidth: 0,
              minHeight: 0,
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
          ...(!creatingPropertyId
            ? {
                borderBottomRightRadius: 4,
                borderBottomLeftRadius: 4,
              }
            : { borderBottomWidth: 0 }),
        })}
      >
        {!creatingPropertyId ? (
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

                  setValue("creatingPropertyId", id);
                  setValue("flattenedPropertyList", {
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
          <ArrayPropertyTypeMenu id={creatingPropertyId} />
        )}
      </Stack>

      {creatingPropertyId ? (
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
              setValue("expectedValues", [
                ...getValues("expectedValues"),
                {
                  typeId: "array",
                  id: creatingPropertyId,
                  flattenedProperties: getValues("flattenedPropertyList"),
                },
              ]);

              closeCustomPropertyMenu();
            }}
          >
            Save expected value
          </Button>
        </Box>
      ) : null}
    </Box>
  );
};
