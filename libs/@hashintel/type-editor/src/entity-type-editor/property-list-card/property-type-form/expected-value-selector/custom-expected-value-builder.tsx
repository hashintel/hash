import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { faClose, faList } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  Chip,
  ChipProps,
  faCube,
  FontAwesomeIcon,
} from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/src/fluid-fonts";
import {
  Box,
  buttonClasses,
  chipClasses,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import uniqueId from "lodash.uniqueid";
import { FunctionComponent } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { getDefaultExpectedValue } from "../../shared/default-expected-value";
import { ArrayExpectedValueBuilder } from "./custom-expected-value-builder/array-expected-value-builder";
import { useCustomExpectedValueBuilderContext } from "./shared/custom-expected-value-builder-context";
import { ExpectedValueSelectorFormValues } from "./shared/expected-value-selector-form-values";
import { ObjectExpectedValueBuilder } from "./shared/object-expected-value-builder";

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
interface ExpectedValueBuilderProps {
  expectedValueId: string;
}

const ExpectedValueBuilder: FunctionComponent<ExpectedValueBuilderProps> = ({
  expectedValueId,
}) => {
  const { control } = useFormContext<ExpectedValueSelectorFormValues>();

  const { handleCancel } = useCustomExpectedValueBuilderContext();

  const customDataType = useWatch({
    control,
    name: `flattenedCustomExpectedValueList.${expectedValueId}.data.typeId`,
  });

  switch (customDataType) {
    case "array":
      return (
        <ArrayExpectedValueBuilder
          expectedValueId={expectedValueId}
          onDelete={handleCancel}
        />
      );
    case "object":
      return (
        <ObjectExpectedValueBuilder
          expectedValueId={expectedValueId}
          onDelete={handleCancel}
        />
      );
    default:
      return null;
  }
};

type CustomExpectedValueBuilderProps = {};

export const CustomExpectedValueBuilder: FunctionComponent<
  CustomExpectedValueBuilderProps
> = () => {
  const { handleSave, handleCancel } = useCustomExpectedValueBuilderContext();
  const { getValues, setValue, control } =
    useFormContext<ExpectedValueSelectorFormValues>();

  const customExpectedValueId = useWatch({
    control,
    name: "customExpectedValueId",
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
              classes={{ popper: fluidFontClassName }}
            >
              <FontAwesomeIcon
                icon={faCircleQuestion}
                sx={{ fontSize: 12, color: ({ palette }) => palette.gray[40] }}
              />
            </Tooltip>
          </Stack>

          <Button
            onClick={handleCancel}
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
          ...(!customExpectedValueId
            ? {
                borderBottomRightRadius: 4,
                borderBottomLeftRadius: 4,
              }
            : { borderBottomWidth: 0 }),
        })}
      >
        {!customExpectedValueId ? (
          <>
            <Stack direction="row" gap={1.75}>
              <Button
                size="small"
                variant="tertiary"
                endIcon={<FontAwesomeIcon icon={{ icon: faCube }} />}
                onClick={() => {
                  const id = uniqueId();

                  setValue("customExpectedValueId", id);
                  setValue("flattenedCustomExpectedValueList", {
                    ...getValues("flattenedCustomExpectedValueList"),
                    [id]: {
                      id,
                      data: getDefaultExpectedValue("object"),
                    },
                  });
                }}
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

                  setValue("customExpectedValueId", id);
                  setValue("flattenedCustomExpectedValueList", {
                    ...getValues("flattenedCustomExpectedValueList"),
                    [id]: {
                      id,
                      data: getDefaultExpectedValue("array"),
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
          <ExpectedValueBuilder expectedValueId={customExpectedValueId} />
        )}
      </Stack>

      {customExpectedValueId ? (
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
              handleSave();
            }}
          >
            Save expected value
          </Button>
        </Box>
      ) : null}
    </Box>
  );
};
