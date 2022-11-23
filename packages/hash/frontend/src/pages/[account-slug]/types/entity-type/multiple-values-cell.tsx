import {
  getInputProps,
  inputLabelProps,
  TextField,
} from "@hashintel/hash-design-system";
import {
  Box,
  Checkbox,
  ClickAwayListener,
  Collapse,
  Fade,
  FormControl,
  InputLabel,
  OutlinedInput,
  Popper,
  TableCell,
  Typography,
} from "@mui/material";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
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
  const { control, setValue } = useFormContext<EntityTypeEditorForm>();

  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const [multipleValuesMenuOpen, setMultipleValuesMenuOpen] = useState(false);

  const [array, minValue, maxValue, infinity] = useWatch({
    control,
    name: [
      `properties.${propertyIndex}.array`,
      `properties.${propertyIndex}.minValue`,
      `properties.${propertyIndex}.maxValue`,
      `properties.${propertyIndex}.infinity`,
    ],
  });

  // This will help to restore values after re-enabling multiple
  // values/disabling infinity
  const [resetMinValue, setResetMinValue] = useState(minValue);
  const [resetMaxValue, setResetMaxValue] = useState(maxValue);

  const menuOpenFrozenMinValue = useFrozenValue(
    minValue,
    !multipleValuesMenuOpen,
  );
  const menuOpenFrozenMaxValue = useFrozenValue(
    maxValue,
    !multipleValuesMenuOpen,
  );

  const isArrayFrozenMinValue = useFrozenValue(minValue, !array);
  const isArrayFrozenMaxValue = useFrozenValue(maxValue, !array);

  const maximumFieldId = useId();

  const [infinityCheckboxNode, setInfinityCheckboxNode] =
    useState<HTMLDivElement | null>(null);

  return (
    <>
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
          sx={({ palette, transitions }) => ({
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
            sx={({ palette, transitions }) => ({
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

                    let nextMinValue = resetMinValue;
                    let nextMaxValue = resetMaxValue;

                    if (!evt.target.checked) {
                      setResetMinValue(minValue);
                      setResetMaxValue(maxValue);
                      nextMinValue = 0;
                      nextMaxValue = 1;
                    }

                    setValue(
                      `properties.${propertyIndex}.minValue`,
                      nextMinValue,
                      { shouldDirty: true },
                    );
                    setValue(
                      `properties.${propertyIndex}.maxValue`,
                      nextMaxValue,
                      { shouldDirty: true },
                    );
                    field.onChange(evt);
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
                      infinity ? "or more" : `to ${isArrayFrozenMaxValue}`
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
          {({ TransitionProps }) => (
            <ClickAwayListener
              onClickAway={() => setMultipleValuesMenuOpen(false)}
            >
              <Fade {...TransitionProps}>
                <Box
                  sx={({ palette, boxShadows }) => ({
                    border: 1,
                    p: 1.5,
                    background: palette.white,
                    borderColor: palette.gray[30],
                    boxShadow: boxShadows.md,
                    borderBottomLeftRadius: 4,
                    borderBottomRightRadius: 4,
                    userSelect: "none",
                  })}
                >
                  {/* Controllers are used for min/max as their values are frozen during animation */}
                  <Controller
                    render={({ field: { value: _, ...field } }) => (
                      <TextField
                        {...field}
                        onChange={(evt) => {
                          const target = evt.target as HTMLInputElement;
                          const min = target.valueAsNumber;

                          if (Number.isNaN(min)) {
                            field.onChange(target.value);
                          } else {
                            if (min > maxValue) {
                              setValue(
                                `properties.${propertyIndex}.maxValue`,
                                min,
                                { shouldDirty: true },
                              );
                            }
                            field.onChange(min);
                          }
                        }}
                        type="number"
                        size="small"
                        label="Minimum"
                        inputProps={{ min: 0 }}
                        value={menuOpenFrozenMinValue}
                        sx={{ mb: 2 }}
                      />
                    )}
                    name={`properties.${propertyIndex}.minValue`}
                  />
                  <FormControl>
                    <InputLabel
                      {...inputLabelProps}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                      htmlFor={maximumFieldId}
                    >
                      Maximum
                      <Box
                        display="flex"
                        color={({ palette }) => palette.gray[70]}
                      >
                        ∞
                        <div ref={setInfinityCheckboxNode} />
                      </Box>
                    </InputLabel>

                    <Collapse in={!infinity}>
                      {/* Using a controller as Infinity is not a valid value for a HTML number input */}
                      <Controller
                        render={({ field: { value: _, ...field } }) => (
                          <OutlinedInput
                            {...getInputProps()}
                            {...field}
                            type="number"
                            inputProps={{ min: 0 }}
                            onChange={(evt) => {
                              const target = evt.target as HTMLInputElement;
                              const max = target.valueAsNumber;

                              if (Number.isNaN(max)) {
                                field.onChange(target.value);
                              } else {
                                if (max < minValue) {
                                  setValue(
                                    `properties.${propertyIndex}.minValue`,
                                    max,
                                    { shouldDirty: true },
                                  );
                                }

                                field.onChange(max);
                              }
                            }}
                            value={menuOpenFrozenMaxValue}
                            size="small"
                            id={maximumFieldId}
                          />
                        )}
                        name={`properties.${propertyIndex}.maxValue`}
                      />
                    </Collapse>
                  </FormControl>
                </Box>
              </Fade>
            </ClickAwayListener>
          )}
        </Popper>
      </TableCell>
      {
        // We use a portal here, to ensure this is outside of the
        // FormControl context so clicking on it doesn't focus the
        // field and cause a blue highlight
        infinityCheckboxNode
          ? createPortal(
              <Controller
                render={({ field: { value, ...field } }) => (
                  <Checkbox
                    {...field}
                    checked={value}
                    onChange={(evt) => {
                      if (typeof maxValue !== "number") {
                        setValue(
                          `properties.${propertyIndex}.maxValue`,
                          Math.max(1, minValue),
                          { shouldDirty: true },
                        );
                      }
                      field.onChange(evt.target.checked);
                    }}
                    sx={{
                      "&, > svg": { fontSize: "inherit" },
                      ml: 0.6,
                    }}
                  />
                )}
                name={`properties.${propertyIndex}.infinity`}
              />,
              infinityCheckboxNode,
            )
          : null
      }
    </>
  );
};
