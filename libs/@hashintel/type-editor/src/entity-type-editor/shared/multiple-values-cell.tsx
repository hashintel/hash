import { faEdit } from "@fortawesome/free-regular-svg-icons";
import {
  addPopperPositionClassPopperModifier,
  FontAwesomeIcon,
  getInputProps,
  inputLabelProps,
  popperPlacementPopperNoRadius,
  TextField,
} from "@hashintel/design-system";
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
import { FunctionComponent, PropsWithChildren, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  Controller,
  useController,
  useFormContext,
  useWatch,
} from "react-hook-form";

import { EntityTypeEditorFormData } from "../../shared/form-types";
import { useIsReadonly } from "../../shared/read-only-context";

const useFrozenValue = <T extends any>(value: T, isFrozen: boolean): T => {
  const [frozen, setFrozen] = useState(value);

  if (!isFrozen && frozen !== value) {
    setFrozen(value);
  }

  return frozen;
};

const Frozen: FunctionComponent<
  PropsWithChildren<{
    frozen: boolean;
  }>
> = ({ children, frozen }) => {
  const frozenChildren = useFrozenValue(children, frozen);

  // Needed to render children directly as could be string, etc
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{frozenChildren}</>;
};

const MultipleValuesCellSummary = ({
  show,
  infinity,
  max,
  min,
}: {
  show: boolean;
  infinity: boolean;
  min: number | string;
  max: number | string;
}) => (
  <Collapse orientation="horizontal" in={show}>
    <Frozen frozen={!show}>
      <Typography
        variant="smallTextLabels"
        sx={{
          display: "flex",
          fontWeight: 500,
          whiteSpace: "nowrap",
          color: ({ palette }) => palette.gray[70],
          userSelect: "none",
        }}
      >
        {infinity || (min !== max && typeof max === "number")
          ? `${min === "" ? 0 : min} ${infinity ? "or more" : `to ${max}`}`
          : min}
      </Typography>
    </Frozen>
  </Collapse>
);

export const MULTIPLE_VALUES_CELL_WIDTH = 170;

export const MultipleValuesCell = ({
  index,
  variant,
}: {
  index: number;
  variant: "property" | "link";
}) => {
  const { control, setValue } = useFormContext<EntityTypeEditorFormData>();

  const isReadonly = useIsReadonly();

  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const [multipleValuesMenuOpen, setMultipleValuesMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const formPrefix = `${
    variant === "property" ? "properties" : "links"
  }.${index}` as const;

  const [array, minValue, maxValue, infinity] = useWatch({
    control,
    name: [
      `${formPrefix}.array`,
      `${formPrefix}.minValue`,
      `${formPrefix}.maxValue`,
      `${formPrefix}.infinity`,
    ],
  });

  // This will help to restore values after re-enabling multiple
  // values/disabling infinity
  const [resetMinValue, setResetMinValue] = useState(minValue);
  const [resetMaxValue, setResetMaxValue] = useState(maxValue);
  const [resetInfinity, setResetInfinity] = useState(infinity);

  const menuOpenFrozenMinValue = useFrozenValue(
    minValue,
    !multipleValuesMenuOpen,
  );
  const menuOpenFrozenMaxValue = useFrozenValue(
    maxValue,
    !multipleValuesMenuOpen,
  );
  const menuOpenFrozenInfinity = useFrozenValue(
    infinity,
    !multipleValuesMenuOpen,
  );

  const maximumFieldId = useId();

  const [infinityCheckboxNode, setInfinityCheckboxNode] =
    useState<HTMLDivElement | null>(null);

  const arrayController = useController({
    control,
    name: `${formPrefix}.array`,
  });

  const canToggle = variant !== "link";
  const showSummary = array || !canToggle;

  const handleArrayChange = (nextArray: boolean) => {
    setMultipleValuesMenuOpen(nextArray);

    let nextMinValue = resetMinValue;
    let nextMaxValue = resetMaxValue;
    let nextInfinity = resetInfinity;

    if (!nextArray) {
      setResetMinValue(minValue);
      setResetMaxValue(maxValue);
      setResetInfinity(infinity);
      nextMinValue = 0;
      nextMaxValue = 1;
      nextInfinity = true;
    }

    setValue(`${formPrefix}.minValue`, nextMinValue, {
      shouldDirty: true,
    });
    setValue(`${formPrefix}.maxValue`, nextMaxValue, {
      shouldDirty: true,
    });
    setValue(`${formPrefix}.infinity`, nextInfinity, {
      shouldDirty: true,
    });
    if (canToggle) {
      arrayController.field.onChange(nextArray);
    }
  };

  return (
    <>
      <TableCell
        ref={(ref: HTMLDivElement) => setAnchorEl(ref)}
        sx={{
          p: "0 !important",
          position: "relative",
        }}
        width={MULTIPLE_VALUES_CELL_WIDTH}
      >
        <Box
          onClick={() => {
            if (isReadonly) {
              return;
            }
            if (multipleValuesMenuOpen) {
              setMultipleValuesMenuOpen(false);
            } else if (array) {
              setMultipleValuesMenuOpen(true);
            } else if (canToggle) {
              handleArrayChange(true);
            }
          }}
          sx={({ palette, transitions }) => ({
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: isReadonly ? "default" : "pointer",
            height: 1,
            transition: transitions.create("border-color"),
            border: 1,
            borderColor: `${
              multipleValuesMenuOpen ? palette.gray[40] : "transparent"
            } !important`,
          })}
          onMouseEnter={() => setHovered(!isReadonly)}
          onMouseLeave={() => setHovered(false)}
        >
          <Box
            sx={({ palette, transitions }) => ({
              display: "inline-flex",
              alignItems: "center",
              borderRadius: canToggle ? "4px 30px 30px 4px" : "30px",
              backgroundColor: "transparent",
              transition: transitions.create(["padding", "background-color"]),
              ...(showSummary
                ? {
                    py: 0.5,
                    px: 0.75,
                    background: palette.gray[20],
                  }
                : {}),
            })}
          >
            {canToggle ? (
              <Checkbox
                {...arrayController.field}
                checked={arrayController.field.value}
                onChange={(evt) => {
                  handleArrayChange(evt.target.checked);
                }}
                sx={{
                  "+ *": {
                    ml: 1,
                  },
                }}
              />
            ) : null}
            <MultipleValuesCellSummary
              show={showSummary}
              infinity={infinity}
              min={minValue}
              max={maxValue}
            />
            {canToggle ? null : (
              <Collapse
                in={hovered || multipleValuesMenuOpen}
                orientation="horizontal"
              >
                <FontAwesomeIcon
                  icon={faEdit}
                  sx={(theme) => ({
                    fontSize: "13px",
                    color: theme.palette.gray[70],
                    ml: 0.5,
                    display: "block",
                  })}
                />
              </Collapse>
            )}
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
            addPopperPositionClassPopperModifier,
            // { name: "flip", enabled: false },
            // { name: "preventOverflow", enabled: false },
            {
              name: "offset",
              enabled: true,
              options: {
                // @todo check this is right
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
                  sx={[
                    ({ palette, boxShadows }) => ({
                      border: 1,
                      p: 1.5,
                      background: palette.white,
                      borderColor: palette.gray[30],
                      boxShadow: boxShadows.md,
                      borderRadius: "4px",
                      userSelect: "none",
                    }),
                    popperPlacementPopperNoRadius,
                  ]}
                >
                  {/* Controllers are used for min/max as their values are frozen during animation */}
                  <Controller
                    render={({ field: { value: _, ...field } }) => (
                      <TextField
                        {...field}
                        onChange={(evt) => {
                          const target = evt.target as HTMLInputElement;
                          let min = target.valueAsNumber;

                          if (Number.isNaN(min)) {
                            field.onChange(target.value);
                          } else {
                            min = Math.max(0, min);

                            if (min > maxValue) {
                              setValue(`${formPrefix}.maxValue`, min, {
                                shouldDirty: true,
                              });
                            }
                            field.onChange(min);
                          }
                        }}
                        onBlur={(evt) => {
                          if (evt.target.value === "") {
                            setValue(`${formPrefix}.minValue`, 0, {
                              shouldDirty: true,
                            });
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
                    name={`${formPrefix}.minValue`}
                    rules={{ min: 0, required: true }}
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

                    <Collapse in={!menuOpenFrozenInfinity}>
                      <Controller
                        render={({ field: { value: _, ...field } }) => (
                          <OutlinedInput
                            {...getInputProps()}
                            {...field}
                            type="number"
                            inputProps={{ min: 0 }}
                            onChange={(evt) => {
                              const target = evt.target as HTMLInputElement;
                              let max = target.valueAsNumber;

                              if (Number.isNaN(max)) {
                                field.onChange(target.value);
                              } else {
                                max = Math.max(max, 0);
                                if (max < minValue) {
                                  setValue(`${formPrefix}.minValue`, max, {
                                    shouldDirty: true,
                                  });
                                }

                                field.onChange(max);
                              }
                            }}
                            onBlur={(evt) => {
                              if (evt.target.value === "") {
                                setValue(
                                  `${formPrefix}.maxValue`,
                                  Math.max(
                                    1,
                                    typeof minValue === "number" ? minValue : 0,
                                  ),
                                  { shouldDirty: true },
                                );
                              }
                            }}
                            value={menuOpenFrozenMaxValue}
                            size="small"
                            id={maximumFieldId}
                          />
                        )}
                        name={`${formPrefix}.maxValue`}
                        rules={{
                          min: 0,
                          required: true,
                        }}
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
        // We use a portal here, to ensure this is outside the
        // FormControl context so clicking on it doesn't focus the
        // field and cause a blue highlight
        infinityCheckboxNode
          ? createPortal(
              <Controller
                render={({ field: { value: _, ...field } }) => (
                  <Checkbox
                    {...field}
                    checked={menuOpenFrozenInfinity}
                    onChange={(evt) => {
                      if (typeof maxValue !== "number") {
                        setValue(
                          `${formPrefix}.maxValue`,
                          Math.max(
                            1,
                            typeof minValue === "number" ? minValue : 0,
                          ),
                          { shouldDirty: true },
                        );
                      } else if (maxValue < minValue) {
                        setValue(`${formPrefix}.maxValue`, minValue, {
                          shouldDirty: true,
                        });
                      }
                      field.onChange(evt.target.checked);
                    }}
                    sx={{
                      "&, > svg": { fontSize: "inherit" },
                      ml: 0.6,
                    }}
                  />
                )}
                name={`${formPrefix}.infinity`}
              />,
              infinityCheckboxNode,
            )
          : null
      }
    </>
  );
};
