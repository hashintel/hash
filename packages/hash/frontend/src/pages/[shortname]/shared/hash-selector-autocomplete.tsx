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
import { Ref, useMemo } from "react";

import { AutocompleteDropdown } from "./autocomplete-dropdown";
import { OntologyChip, parseUriForOntologyChip } from "./ontology-chip";
import {
  addPopperPositionClassPopperModifier,
  popperPlacementInputNoBorder,
  popperPlacementInputNoRadius,
} from "./popper-placement-modifier";
import { StyledPlusCircleIcon } from "./styled-plus-circle-icon";

const TYPE_SELECTOR_HEIGHT = 57;

export type TypeListSelectorDropdownProps = {
  query: string;
  createButtonProps: Omit<ButtonProps, "children" | "variant" | "size"> | null;
  variant: "entityType" | "propertyType" | "entity" | "linkType";
  joined?: boolean;
};

const TypeListSelectorDropdown = ({
  children,
  dropdownProps,
  ...props
}: PaperProps & { dropdownProps: TypeListSelectorDropdownProps }) => {
  const { query, createButtonProps, variant, joined } = dropdownProps;

  return (
    <AutocompleteDropdown
      inputHeight={TYPE_SELECTOR_HEIGHT}
      joined={joined}
      {...props}
    >
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
  AutocompleteProps<T, Multiple, false, false>,
  | "renderInput"
  | "renderOption"
  | "getOptionLabel"
  | "PaperComponent"
  | "componentsProps"
> & {
  inputRef?: Ref<any>;
  inputPlaceholder?: string;
  optionToRenderData: (option: T) => OptionRenderData;
  dropdownProps: Omit<TypeListSelectorDropdownProps, "joined">;
  autoFocus?: boolean;
  modifiers?: PopperProps["modifiers"];
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
      {
        name: "offset",
        options: {
          offset: [0, joined ? -TYPE_SELECTOR_HEIGHT : 0],
        },
      },
      ...(modifiers ?? []),
    ],
    [modifiers],
  );

  return (
    <Autocomplete
      open={open}
      sx={[{ width: "100%" }, ...(Array.isArray(sx) ? sx : [sx])]}
      renderInput={(props) => (
        <TextField
          {...props}
          autoFocus={autoFocus}
          inputRef={inputRef}
          placeholder={inputPlaceholder}
          sx={{
            width: "100%",
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

                // @todo placement
                ...(joined
                  ? {
                      top: `-${TYPE_SELECTOR_HEIGHT}px`,
                      zIndex: theme.zIndex.modal + 1,
                    }
                  : {}),

                // Focus is handled by the options popover
                "&.Mui-focused": {
                  boxShadow: "none",
                },

                [`.${outlinedInputClasses.notchedOutline}`]: {
                  border: `1px solid ${theme.palette.gray[30]} !important`,
                },
              }),
              ...(open
                ? [popperPlacementInputNoRadius, popperPlacementInputNoBorder]
                : []),
              ...(joined ? [{}] : []),
            ],
          }}
        />
      )}
      renderOption={(props, option) => {
        const { $id, description, title } = optionToRenderData(option);
        const ontology = parseUriForOntologyChip($id);

        // @todo extract component
        return (
          <li
            {...props}
            data-testid="property-selector-option"
            /** added "click-outside-ignore" to be able to use this selector with Grid component */
            className={clsx(props.className, "click-outside-ignore")}
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
      clearIcon={null}
      forcePopupIcon={false}
      selectOnFocus={false}
      openOnFocus
      clearOnBlur={false}
      getOptionLabel={(opt) => optionToRenderData(opt).title}
      // eslint-disable-next-line react/no-unstable-nested-components
      PaperComponent={(props) => (
        <TypeListSelectorDropdown
          {...props}
          dropdownProps={{ ...dropdownProps, joined }}
        />
      )}
      componentsProps={{
        popper: { modifiers: allModifiers },
      }}
      {...rest}
    />
  );
};
