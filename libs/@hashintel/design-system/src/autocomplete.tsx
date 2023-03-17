import { faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  Autocomplete as MUIAutocomplete,
  AutocompleteProps as MUIAutocompleteProps,
  InputProps,
  outlinedInputClasses,
  PaperProps,
  PopperProps,
} from "@mui/material";
import { Ref, useCallback, useMemo, useState } from "react";

import { AutocompleteDropdown } from "./autocomplete-dropdown";
import { FontAwesomeIcon, TextField } from "./main";
import {
  addPopperPositionClassPopperModifier,
  popperPlacementInputNoBorder,
  popperPlacementInputNoRadius,
} from "./popper-placement-modifier";

type AutocompleteProps<
  T,
  Multiple extends boolean | undefined = undefined,
> = Omit<MUIAutocompleteProps<T, Multiple, true, false>, "renderInput"> & {
  height?: number;
  inputRef?: Ref<any>;
  inputPlaceholder?: string;
  inputProps: InputProps;
  autoFocus?: boolean;
  modifiers?: PopperProps["modifiers"];
  /**
   * joined indicates that the input is connected to another element, so we
   * change the visual appearance of the component to make it flow straight into
   * whatever element it's connected to
   */
  joined?: boolean;
};

export const Autocomplete = <
  T,
  Multiple extends boolean | undefined = undefined,
>({
  height = 57,
  open,
  sx,
  inputRef,
  inputPlaceholder,
  inputProps,
  autoFocus = true,
  modifiers,
  joined = true,
  options,
  componentsProps,
  ...rest
}: AutocompleteProps<
  Multiple extends true ? (T extends any[] ? T[number] : T) : T,
  Multiple
>) => {
  const allModifiers = useMemo(
    (): PopperProps["modifiers"] => [
      addPopperPositionClassPopperModifier,
      // We don't want the popup shifting position as that will break styles
      { name: "preventOverflow", enabled: false },
      ...(modifiers ?? []),
    ],
    [modifiers],
  );

  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);

  const popperOpenStyles = joined
    ? {
        ...popperPlacementInputNoRadius,
        ...popperPlacementInputNoBorder,
        boxShadow: "none",
      }
    : {};

  const paperComponent = useCallback(
    ({ children, ...props }: PaperProps) =>
      options.length ? (
        <AutocompleteDropdown {...props} joined={joined} inputHeight={height}>
          {children}
        </AutocompleteDropdown>
      ) : null,
    [joined, height, options],
  );

  return (
    <MUIAutocomplete
      open={open}
      options={options}
      sx={[{ width: "100%" }, ...(Array.isArray(sx) ? sx : [sx])]}
      /**
       * By default, the anchor element for an autocomplete dropdown is the
       * input base, but we some uses of this component depend on resizing the
       * autocomplete root in order to attach the popup in a slightly different
       * place, so we make the autocomplete root the anchor element for the
       * popup.
       *
       * @see LinkEntityTypeSelector
       */
      ref={setAnchorEl}
      renderInput={(params) => (
        <TextField
          {...params}
          autoFocus={autoFocus}
          inputRef={inputRef}
          placeholder={inputPlaceholder}
          sx={{ width: "100%" }}
          /**
           * Prevents backspace deleting chips when in multiple mode
           * @see https://github.com/mui/material-ui/issues/21129#issuecomment-636919142
           */
          onKeyDown={(event) => {
            if (event.key === "Backspace") {
              event.stopPropagation();
            }
          }}
          InputProps={{
            ...params.InputProps,
            ...inputProps,
            endAdornment: inputProps.endAdornment ?? (
              <FontAwesomeIcon
                icon={faSearch}
                sx={{
                  fontSize: 14,
                  color: ({ palette }) => palette.gray[40],
                }}
              />
            ),
            sx: [
              (theme) => ({
                // The popover needs to know how tall this is to draw
                // a shadow around it
                height,

                // Focus is handled by the options popover
                "&.Mui-focused": {
                  boxShadow: "none",
                  ...(open === undefined && options.length
                    ? popperOpenStyles
                    : {}),
                },

                [`.${outlinedInputClasses.notchedOutline}`]: {
                  border: `1px solid ${theme.palette.gray[30]} !important`,
                },
              }),
              open && options.length ? popperOpenStyles : {},
              ...(inputProps.sx
                ? Array.isArray(inputProps.sx)
                  ? inputProps.sx
                  : [inputProps.sx]
                : []),
            ],
          }}
        />
      )}
      popupIcon={null}
      disableClearable
      forcePopupIcon={false}
      selectOnFocus={false}
      openOnFocus
      clearOnBlur={false}
      PaperComponent={paperComponent}
      componentsProps={{
        ...componentsProps,
        popper: {
          ...(componentsProps?.popper ?? {}),
          modifiers: allModifiers,
          anchorEl,
        },
      }}
      {...rest}
    />
  );
};
