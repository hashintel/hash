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
import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { EntityTypeEditorForm } from "./form-types";

export const MultipleValuesCell = ({
  propertyIndex,
}: {
  propertyIndex: number;
}) => {
  const { register, setValue } = useFormContext<EntityTypeEditorForm>();

  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const [multipleValuesMenuOpen, setMultipleValuesMenuOpen] = useState(false);

  const [array, minValue, maxValue] = useWatch({
    name: [
      `properties.${propertyIndex}.array`,
      `properties.${propertyIndex}.minValue`,
      `properties.${propertyIndex}.maxValue`,
    ],
  });

  useEffect(() => {
    if (minValue > maxValue) {
      setValue(`properties.${propertyIndex}.maxValue`, minValue);
    }
    // Should only be triggered when minValue updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyIndex, setValue, minValue]);

  useEffect(() => {
    if (maxValue < minValue) {
      setValue(`properties.${propertyIndex}.minValue`, maxValue);
    }
    // Should only be triggered when maxValue updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyIndex, setValue, maxValue]);

  return (
    <>
      <TableCell
        ref={(ref: HTMLDivElement) => setAnchorEl(ref)}
        sx={({ palette, transitions }) => ({
          px: "0px !important",
          position: "relative",
          cursor: "pointer",
          textAlign: "center",
          transition: transitions.create("border-color"),
          border: `1px solid ${
            multipleValuesMenuOpen ? palette.gray[40] : "transparent"
          } !important`,
          "&:hover": {
            borderColor: `${palette.gray[40]} !important`,
          },
        })}
        onClick={() => setMultipleValuesMenuOpen(true)}
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
          <Checkbox
            sx={{
              zIndex: 1,
            }}
            checked={array}
            {...register(`properties.${propertyIndex}.array`)}
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
              {minValue !== maxValue ? `${minValue} to ${maxValue}` : minValue}
            </Typography>
          </Collapse>
        </Box>
      </TableCell>

      <Popper
        open={multipleValuesMenuOpen}
        anchorEl={anchorEl}
        container={anchorEl}
        placement="bottom"
        sx={{ width: 1, zIndex: 1 }}
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
                    value={minValue}
                    inputProps={{ min: 0 }}
                    {...register(`properties.${propertyIndex}.minValue`, {
                      valueAsNumber: true,
                    })}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    type="number"
                    label="Maximum"
                    value={maxValue}
                    inputProps={{ min: 0 }}
                    {...register(`properties.${propertyIndex}.maxValue`, {
                      valueAsNumber: true,
                      setValueAs: (val) => {
                        console.log(val);
                        return val;
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
