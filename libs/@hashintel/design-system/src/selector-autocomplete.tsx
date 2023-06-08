import { faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  Autocomplete,
  AutocompleteProps,
  outlinedInputClasses,
  PaperProps,
  PopperProps,
  Typography,
} from "@mui/material";
import { createContext, Ref, useContext, useMemo, useState } from "react";

import { AutocompleteDropdown } from "./autocomplete-dropdown";
import { Button, ButtonProps } from "./button";
import { Chip } from "./chip";
import { fluidFontClassName } from "./fluid-fonts";
import { FontAwesomeIcon } from "./fontawesome-icon";
import { StyledPlusCircleIcon } from "./icon-circle-plus";
import {
  addPopperPositionClassPopperModifier,
  popperPlacementInputNoBorder,
  popperPlacementInputNoRadius,
} from "./popper-placement-modifier";
import { SelectorAutocompleteOption } from "./selector-autocomplete/selector-autocomplete-option";
import { TextField } from "./text-field";

export const TYPE_SELECTOR_HEIGHT = 57;

export type TypeListSelectorDropdownProps = {
  query: string;
  createButtonProps: Omit<ButtonProps, "children" | "variant" | "size"> | null;
  variant: "entityType" | "propertyType" | "entity" | "linkType";
};

const DropdownPropsContext =
  createContext<TypeListSelectorDropdownProps | null>(null);

const useDropdownProps = () => {
  const value = useContext(DropdownPropsContext);

  if (!value) {
    throw new Error("Dropdown props context provider missing");
  }

  return value;
};

const TypeListSelectorDropdown = ({ children, ...props }: PaperProps) => {
  const { query, createButtonProps, variant } = useDropdownProps();

  return (
    <AutocompleteDropdown {...props} inputHeight={TYPE_SELECTOR_HEIGHT}>
      {children}
      {createButtonProps ? (
        <Button
          variant="tertiary"
          startIcon={<StyledPlusCircleIcon />}
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            mt: 1,
          }}
          {...createButtonProps}
        >
          <Typography
            variant="smallTextLabels"
            sx={(theme) => ({
              color: theme.palette.gray[60],
              fontWeight: 500,
            })}
          >
            Create
          </Typography>
          {query ? (
            <>
              &nbsp;
              <Typography
                variant="smallTextLabels"
                sx={(theme) => ({
                  color: theme.palette.gray[60],
                  fontWeight: 600,
                })}
              >
                {query}
              </Typography>
            </>
          ) : null}
          {variant === "entityType" ? (
            <Chip color="teal" label="ENTITY TYPE" sx={{ ml: 1.5 }} />
          ) : variant === "entity" ? (
            <Chip color="teal" label="ENTITY" sx={{ ml: 1.5 }} />
          ) : variant === "linkType" ? (
            <Chip color="turquoise" label="LINK TYPE" sx={{ ml: 1.5 }} />
          ) : (
            <Chip color="purple" label="PROPERTY TYPE" sx={{ ml: 1.5 }} />
          )}
        </Button>
      ) : null}
    </AutocompleteDropdown>
  );
};

type OptionRenderData = {
  /** a unique id for this option, which will be used as a key for the option */
  uniqueId: string;
  /** the typeId associated with this entity type or entity, displayed as a chip in the option */
  typeId: string;
  title: string;
  description?: string;
};

type SelectorAutocompleteProps<
  T,
  Multiple extends boolean | undefined = undefined,
> = Omit<
  AutocompleteProps<T, Multiple, true, false>,
  | "renderInput"
  | "renderOption"
  | "getOptionLabel"
  | "PaperComponent"
  | "componentsProps"
> & {
  inputRef?: Ref<any>;
  inputPlaceholder?: string;
  /** Determines if a given option matches a selected value (defaults to strict equality) */
  isOptionEqualToValue?: (option: T, value: T) => boolean;
  optionToRenderData: (option: T) => OptionRenderData;
  dropdownProps: TypeListSelectorDropdownProps;
  autoFocus?: boolean;
  modifiers?: PopperProps["modifiers"];
  /**
   * joined indicates that the input is connected to another element, so we
   * change the visual appearance of the component to make it flow straight into
   * whatever element it's connected to
   */
  joined?: boolean;
};

export const SelectorAutocomplete = <
  T,
  Multiple extends boolean | undefined = undefined,
>({
  open,
  isOptionEqualToValue,
  optionToRenderData,
  sx,
  inputRef,
  inputPlaceholder,
  dropdownProps,
  autoFocus = true,
  modifiers,
  joined,
  ...rest
}: SelectorAutocompleteProps<
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

  return (
    <DropdownPropsContext.Provider value={dropdownProps}>
      <Autocomplete
        open={open}
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
        renderInput={(props) => (
          <TextField
            {...props}
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
              ...props.InputProps,
              endAdornment: (
                <FontAwesomeIcon
                  icon={faSearch}
                  sx={(theme) => ({
                    fontSize: 12,
                    mr: 2,
                    color: theme.palette.gray[50],
                  })}
                />
              ),
              sx: [
                (theme) => ({
                  // The popover needs to know how tall this is to draw
                  // a shadow around it
                  height: TYPE_SELECTOR_HEIGHT,

                  // Focus is handled by the options popover
                  "&.Mui-focused": {
                    boxShadow: "none",
                  },

                  [`.${outlinedInputClasses.notchedOutline}`]: {
                    border: `1px solid ${theme.palette.gray[30]} !important`,
                  },
                }),
                ...(open
                  ? [
                      popperPlacementInputNoRadius,
                      popperPlacementInputNoBorder,
                      joined
                        ? { borderRadius: "0 !important", boxShadow: "none" }
                        : {},
                    ]
                  : []),
              ],
            }}
          />
        )}
        renderOption={(props, option) => {
          const optionRenderData = optionToRenderData(option);

          return (
            <SelectorAutocompleteOption
              liProps={props}
              key={optionRenderData.uniqueId}
              {...optionRenderData}
            />
          );
        }}
        isOptionEqualToValue={isOptionEqualToValue}
        popupIcon={null}
        disableClearable
        forcePopupIcon={false}
        selectOnFocus={false}
        openOnFocus
        clearOnBlur={false}
        getOptionLabel={(opt) => optionToRenderData(opt).title}
        PaperComponent={TypeListSelectorDropdown}
        componentsProps={{
          popper: {
            modifiers: allModifiers,
            anchorEl,
            className: fluidFontClassName,
          },
        }}
        {...rest}
      />
    </DropdownPropsContext.Provider>
  );
};
