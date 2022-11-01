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
    name: [
      `properties.${propertyIndex}.array`,
      `properties.${propertyIndex}.minValue`,
      `properties.${propertyIndex}.maxValue`,
    ],
  });

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
            border: `1px solid ${
              multipleValuesMenuOpen ? palette.gray[40] : "transparent"
            } !important`,
            "&:hover": {
              borderColor: `${palette.gray[40]} !important`,
            },
          })}
        >
          <Box
            sx={({ palette, transitions }) => ({
              display: "inline-flex",
              borderRadius: "4px 30px 30px 4px",
              backgroundColor: "transparent",
              transition: transitions.create(["padding", "background-color"]),
              ...(array && !multipleValuesMenuOpen
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

            <Collapse
              orientation="horizontal"
              in={array && !multipleValuesMenuOpen}
            >
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
