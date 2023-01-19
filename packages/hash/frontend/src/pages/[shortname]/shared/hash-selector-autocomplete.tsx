import { faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  ButtonProps,
  Chip,
  FontAwesomeIcon,
  TextField,
} from "@hashintel/hash-design-system";
import {
  Autocomplete,
  AutocompleteProps,
  Box,
  outlinedInputClasses,
  PaperProps,
  PopperProps,
  Typography,
} from "@mui/material";
import clsx from "clsx";
import { Ref, useMemo, useState } from "react";

import { AutocompleteDropdown } from "./autocomplete-dropdown";
import { OntologyChip, parseUriForOntologyChip } from "./ontology-chip";
import {
  addPopperPositionClassPopperModifier,
  popperPlacementInputNoBorder,
  popperPlacementInputNoRadius,
} from "./popper-placement-modifier";
import { StyledPlusCircleIcon } from "./styled-plus-circle-icon";

export const TYPE_SELECTOR_HEIGHT = 57;

export type TypeListSelectorDropdownProps = {
  query: string;
  createButtonProps: Omit<ButtonProps, "children" | "variant" | "size"> | null;
  variant: "entityType" | "propertyType" | "entity" | "linkType";
};

const TypeListSelectorDropdown = ({
  children,
  dropdownProps,
  ...props
}: PaperProps & { dropdownProps: TypeListSelectorDropdownProps }) => {
  const { query, createButtonProps, variant } = dropdownProps;

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
  $id: string;
  title: string;
  description?: string;
};

type HashSelectorAutocompleteProps<
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
  optionToRenderData: (option: T) => OptionRenderData;
  dropdownProps: TypeListSelectorDropdownProps;
  autoFocus?: boolean;
  modifiers?: PopperProps["modifiers"];
  /**
   * joined indicates that the input is connected to another element, so we
   * change the visual appearance of the component to make it flow straight into
   * whatever element its connected to
   */
  joined?: boolean;
};

export const HashSelectorAutocomplete = <
  T,
  Multiple extends boolean | undefined = undefined,
>({
  open,
  optionToRenderData,
  sx,
  inputRef,
  inputPlaceholder,
  dropdownProps,
  autoFocus = true,
  modifiers,
  joined,
  ...rest
}: HashSelectorAutocompleteProps<
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
          // Prevents backspace deleting chips when in multiple mode
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
        const { $id, description, title } = optionToRenderData(option);
        const ontology = parseUriForOntologyChip($id);

        // @todo extract component
        let className = clsx(props.className, "click-outside-ignore");

        return (
          <li
            {...props}
            data-testid="property-selector-option"
            /** added "click-outside-ignore" to be able to use this selector with Grid component */
            className={className}
          >
            <Box width="100%">
              <Box
                width="100%"
                display="flex"
                alignItems="center"
                mb={0.5}
                whiteSpace="nowrap"
              >
                <Box
                  component="span"
                  flexShrink={0}
                  display="flex"
                  alignItems="center"
                >
                  <Typography
                    variant="smallTextLabels"
                    fontWeight={500}
                    mr={0.5}
                    color="black"
                  >
                    {title}
                  </Typography>
                </Box>
                <OntologyChip
                  {...ontology}
                  path={
                    <Typography
                      component="span"
                      fontWeight="bold"
                      color={(theme) => theme.palette.blue[70]}
                    >
                      {ontology.path}
                    </Typography>
                  }
                  sx={{ flexShrink: 1, ml: 1.25, mr: 2 }}
                />
              </Box>
              <Typography
                component={Box}
                variant="microText"
                sx={(theme) => ({
                  color: theme.palette.gray[50],
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  width: "100%",
                })}
              >
                {description}
              </Typography>
            </Box>
          </li>
        );
      }}
      popupIcon={null}
      disableClearable
      forcePopupIcon={false}
      selectOnFocus={false}
      openOnFocus
      clearOnBlur={false}
      getOptionLabel={(opt) => optionToRenderData(opt).title}
      // eslint-disable-next-line react/no-unstable-nested-components
      PaperComponent={(props) => (
        <TypeListSelectorDropdown {...props} dropdownProps={dropdownProps} />
      )}
      componentsProps={{
        popper: { modifiers: allModifiers, anchorEl },
      }}
      {...rest}
    />
  );
};
