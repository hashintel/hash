import { TextField } from "@hashintel/hash-design-system/text-field";
import {
  Box,
  Checkbox,
  ClickAwayListener,
  Collapse,
  Fade,
  Popper,
  TableCell,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useFormContext, useWatch, Controller } from "react-hook-form";
import { EntityTypeEditorForm } from "./form-types";

export const MultipleValuesCell = ({
  propertyIndex,
}: {
  propertyIndex: number;
}) => {
  const { register, control, setValue, getValues } =
    useFormContext<EntityTypeEditorForm>();

  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const [multipleValuesMenuOpen, setMultipleValuesMenuOpen] = useState(false);

  const [array, minValue, maxValue] = useWatch({
    control,
    name: [
      `properties.${propertyIndex}.array`,
      `properties.${propertyIndex}.minValue`,
      `properties.${propertyIndex}.maxValue`,
    ],
  });

  const summaryVisible = array && !multipleValuesMenuOpen;

  return (
    <>
      <TableCell
        ref={(ref: HTMLDivElement) => setAnchorEl(ref)}
        sx={{
          p: "0 !important",
          position: "relative",
        }}
        onClick={() => setMultipleValuesMenuOpen(true)}
      >
        <Box
          sx={({ palette, transitions }) => ({
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            height: 1,
            transition: transitions.create("border-color"),
            border: 1,
            borderColor: multipleValuesMenuOpen
              ? `${palette.gray[40]} !important`
              : "transparent !important",
          })}
        >
          <Box
            sx={({ palette, transitions }) => ({
              display: "inline-flex",
              borderRadius: "4px 30px 30px 4px",
              backgroundColor: "transparent",
              transition: transitions.create(["padding", "background-color"]),
              ...(summaryVisible
                ? {
                    py: 0.5,
                    px: 0.75,
                    background: palette.gray[20],
                  }
                : {}),
            })}
          >
            <Controller
              render={({ field: { value, ...field } }) => (
                <Checkbox {...field} checked={value} />
              )}
              control={control}
              name={`properties.${propertyIndex}.array`}
            />

            <Collapse orientation="horizontal" in={summaryVisible}>
              <Typography
                variant="smallTextLabels"
                sx={{
                  display: "flex",
                  ml: 1,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  color: ({ palette }) => palette.gray[70],
                }}
              >
                {minValue !== maxValue
                  ? `${minValue} to ${maxValue}`
                  : minValue}
              </Typography>
            </Collapse>
          </Box>
        </Box>
      </TableCell>

      <Popper
        open={multipleValuesMenuOpen}
        anchorEl={anchorEl}
        container={anchorEl}
        placement="bottom"
        sx={{ width: 1, zIndex: 1, top: "-1px !important" }}
        transition
      >
        {({ TransitionProps }) => {
          return (
            <ClickAwayListener
              onClickAway={() => setMultipleValuesMenuOpen(false)}
            >
              <Fade {...TransitionProps}>
                <Box
                  sx={({ palette }) => ({
                    border: 1,
                    p: 1.5,
                    background: palette.white,
                    borderColor: palette.gray[30],
                    boxShadow:
                      "0px 11px 30px rgba(61, 78, 133, 0.04), 0px 7.12963px 18.37px rgba(61, 78, 133, 0.05), 0px 4.23704px 8.1px rgba(61, 78, 133, 0.06), 0px 0.203704px 0.62963px rgba(61, 78, 133, 0.07)",
                    borderBottomLeftRadius: 4,
                    borderBottomRightRadius: 4,
                  })}
                >
                  <TextField
                    type="number"
                    size="small"
                    label="Minimum"
                    inputProps={{ min: 0 }}
                    {...register(`properties.${propertyIndex}.minValue`, {
                      valueAsNumber: true,
                      onChange(evt) {
                        const max = getValues(
                          `properties.${propertyIndex}.maxValue`,
                        );
                        const min = evt.target.value;
                        if (min > max) {
                          setValue(`properties.${propertyIndex}.maxValue`, min);
                        }
                      },
                    })}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    type="number"
                    label="Maximum"
                    inputProps={{ min: 0 }}
                    {...register(`properties.${propertyIndex}.maxValue`, {
                      valueAsNumber: true,
                      onChange(evt) {
                        const min = getValues(
                          `properties.${propertyIndex}.minValue`,
                        );
                        const max = evt.target.value;
                        if (max < min) {
                          setValue(`properties.${propertyIndex}.minValue`, max);
                        }
                      },
                    })}
                    size="small"
                  />
                </Box>
              </Fade>
            </ClickAwayListener>
          );
        }}
      </Popper>
    </>
  );
};
