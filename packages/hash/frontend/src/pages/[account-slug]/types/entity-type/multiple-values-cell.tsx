import { TextField } from "@hashintel/hash-design-system";
import {
  Box,
  Checkbox,
  ClickAwayListener,
  Collapse,
  Fade,
  Popper,
  TableCell,
  Typography,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { EntityTypeEditorForm } from "./form-types";

const useFrozenValue = <T extends any>(value: T, isFrozen: boolean): T => {
  const [frozen, setFrozen] = useState(value);

  if (!isFrozen && frozen !== value) {
    setFrozen(value);
  }

  return frozen;
};

export const MultipleValuesCell = ({
  propertyIndex,
}: {
  propertyIndex: number;
}) => {
  const { register, control, setValue } =
    useFormContext<EntityTypeEditorForm>();

  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const [multipleValuesMenuOpen, setMultipleValuesMenuOpen] = useState(false);
  const { transitions } = useTheme();

  const [array, minValue, maxValue] = useWatch({
    control,
    name: [
      `properties.${propertyIndex}.array`,
      `properties.${propertyIndex}.minValue`,
      `properties.${propertyIndex}.maxValue`,
    ],
  });

  const menuOpenFrozenMinValue = useFrozenValue(
    minValue,
    !multipleValuesMenuOpen,
  );
  const menuOpenFrozenMaxValue = useFrozenValue(
    maxValue,
    !multipleValuesMenuOpen,
  );

  const frozenMaxValue = useFrozenValue(
    menuOpenFrozenMaxValue,
    maxValue === Infinity,
  );

  const isArrayFrozenMinValue = useFrozenValue(minValue, !array);
  const isArrayFrozenMaxValue = useFrozenValue(maxValue, !array);

  return (
    <TableCell
      ref={(ref: HTMLDivElement) => setAnchorEl(ref)}
      sx={{
        p: "0 !important",
        position: "relative",
      }}
    >
      <Box
        onClick={() => {
          if (multipleValuesMenuOpen) {
            setMultipleValuesMenuOpen(false);
          } else {
            setValue(`properties.${propertyIndex}.array`, true, {
              shouldDirty: true,
            });
            setMultipleValuesMenuOpen(true);
          }
        }}
        sx={({ palette }) => ({
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          height: 1,
          transition: transitions.create("border-color"),
          border: 1,
          borderColor: `${
            multipleValuesMenuOpen ? palette.gray[40] : "transparent"
          } !important`,
        })}
      >
        <Box
          sx={({ palette }) => ({
            display: "inline-flex",
            borderRadius: "4px 30px 30px 4px",
            backgroundColor: "transparent",
            transition: transitions.create(["padding", "background-color"]),
            ...(array
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
              <Checkbox
                {...field}
                checked={value}
                onChange={(evt) => {
                  setMultipleValuesMenuOpen(evt.target.checked);
                  if (!evt.target.checked) {
                    setValue(`properties.${propertyIndex}.minValue`, 0, {
                      shouldDirty: true,
                    });
                    setValue(`properties.${propertyIndex}.maxValue`, Infinity, {
                      shouldDirty: true,
                    });
                  }
                  field.onChange(evt);
                }}
                onClick={(evt) => {
                  evt.stopPropagation();
                }}
              />
            )}
            control={control}
            name={`properties.${propertyIndex}.array`}
          />

          <Collapse orientation="horizontal" in={array}>
            <Typography
              variant="smallTextLabels"
              sx={{
                display: "flex",
                ml: 1,
                fontWeight: 500,
                whiteSpace: "nowrap",
                color: ({ palette }) => palette.gray[70],
                userSelect: "none",
              }}
            >
              {isArrayFrozenMinValue !== isArrayFrozenMaxValue
                ? `${isArrayFrozenMinValue} ${
                    isArrayFrozenMaxValue === Infinity
                      ? "or more"
                      : `to ${isArrayFrozenMaxValue}`
                  }`
                : isArrayFrozenMinValue}
            </Typography>
          </Collapse>
        </Box>
      </Box>
      <Popper
        open={multipleValuesMenuOpen}
        anchorEl={anchorEl}
        container={anchorEl}
        placement="bottom"
        sx={{
          width: 1,
          zIndex: 1,
        }}
        transition
        // Attempt to prevent this messing with the edit bar scroll freezing
        modifiers={[
          { name: "flip", enabled: false },
          { name: "preventOverflow", enabled: false },
          {
            name: "offset",
            enabled: true,
            options: {
              offset: () => [0, -1],
            },
          },
        ]}
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
                    userSelect: "none",
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
                        const min = evt.target.value;
                        if (min > maxValue) {
                          setValue(
                            `properties.${propertyIndex}.maxValue`,
                            min,
                            { shouldDirty: true },
                          );
                        }
                      },
                    })}
                    value={menuOpenFrozenMinValue}
                    sx={{ mb: 2 }}
                  />
                  <Box display="flex">
                    Maximum
                    <Box display="flex" ml="auto">
                      ∞
                      <Checkbox
                        checked={maxValue === Infinity}
                        onChange={(evt) =>
                          setValue(
                            `properties.${propertyIndex}.maxValue`,
                            evt.target.checked
                              ? Infinity
                              : Math.max(1, minValue),
                            { shouldDirty: true },
                          )
                        }
                        sx={{
                          "&, > svg": { fontSize: "inherit" },
                          ml: 0.6,
                        }}
                      />
                    </Box>
                  </Box>
                  <Collapse in={maxValue < Infinity}>
                    <TextField
                      type="number"
                      label={null}
                      inputProps={{ min: 0 }}
                      {...register(`properties.${propertyIndex}.maxValue`, {
                        valueAsNumber: true,
                        onChange(evt) {
                          const max = evt.target.value;
                          if (max < minValue) {
                            setValue(
                              `properties.${propertyIndex}.minValue`,
                              max,
                              { shouldDirty: true },
                            );
                          }
                        },
                      })}
                      value={frozenMaxValue}
                      size="small"
                    />
                  </Collapse>
                </Box>
              </Fade>
            </ClickAwayListener>
          );
        }}
      </Popper>
    </TableCell>
  );
};
