import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, TextField } from "@hashintel/hash-design-system";
import {
  Autocomplete,
  AutocompleteProps,
  Box,
  outlinedInputClasses,
  PopperProps,
  Typography,
} from "@mui/material";
import clsx from "clsx";
import { Ref, useMemo } from "react";
import {
  OntologyChip,
  parseUriForOntologyChip,
} from "../../shared/ontology-chip";
import {
  TypeListSelectorDropdown,
  TypeListSelectorDropdownProps,
  TYPE_SELECTOR_HEIGHT,
} from "./type-list-selector-dropdown";

type OptionRenderData = {
  $id: string;
  title: string;
  description?: string;
};

type HashSelectorAutocompleteProps<T extends unknown> = Omit<
  AutocompleteProps<T, false, false, false>,
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
};

export const HashSelectorAutocomplete = <T extends unknown>({
  open,
  optionToRenderData,
  sx,
  inputRef,
  inputPlaceholder,
  dropdownProps,
  ...rest
}: HashSelectorAutocompleteProps<T>) => {
  const modifiers = useMemo(
    (): PopperProps["modifiers"] => [
      {
        name: "addPositionClass",
        enabled: true,
        phase: "write",
        fn({ state }) {
          if (state.elements.reference instanceof HTMLElement) {
            state.elements.reference.setAttribute(
              "data-popper-placement",
              state.placement,
            );
          }
        },
      },
      {
        name: "preventOverflow",
        enabled: false,
      },
    ],
    [],
  );

  return (
    <Autocomplete
      open={open}
      sx={[{ width: "100%" }, ...(Array.isArray(sx) ? sx : [sx])]}
      renderInput={(props) => (
        <TextField
          {...props}
          autoFocus
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
            sx: (theme) => ({
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

              ...(open && {
                [`&[data-popper-placement="bottom"]`]: {
                  borderBottom: 0,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                },
                [`&[data-popper-placement="top"]`]: {
                  borderTop: 0,
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                },
              }),
            }),
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
        <TypeListSelectorDropdown {...props} dropdownProps={dropdownProps} />
      )}
      componentsProps={{
        popper: { modifiers },
      }}
      {...rest}
    />
  );
};
