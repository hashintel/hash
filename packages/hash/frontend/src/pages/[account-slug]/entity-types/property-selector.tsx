import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { Chip } from "@hashintel/hash-design-system/chip";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { TextField } from "@hashintel/hash-design-system/text-field";
import {
  Autocomplete,
  Box,
  outlinedInputClasses,
  PopperProps,
  Typography,
} from "@mui/material";
import { PopupState } from "material-ui-popup-state/hooks";
import { forwardRef, useMemo, useRef, useState } from "react";
import { ArrowUpRightIcon } from "../../../shared/icons/svg";
import { OntologyChip } from "./ontology-chip";
import { PlaceholderIcon } from "./placeholder-icon";
import { PropertyListSelectorDropdown } from "./property-list-selector-dropdown";

export const PROPERTY_SELECTOR_HEIGHT = 57;

const insertPropertyOptions = [
  {
    title: "Share Price",
    icon: <PlaceholderIcon />,
    domain: "hash.ai",
    path: "@nasdaq",
    expectedValues: ["Currency"],
    description: "A company's current price per share",
  },
  {
    title: "Stock Symbol ",
    icon: <PlaceholderIcon />,
    domain: "hash.ai",
    path: "@acme-corp",
    expectedValues: ["Text"],
    description:
      "An abbreviation used to uniquely identify public traded shares",
  },
  {
    title: "Ownership Percentage",
    icon: <PlaceholderIcon />,
    domain: "hash.ai",
    path: "@wrapped-text-that-is-long-enough",
    expectedValues: ["Number"],
    description:
      "An entity’s ownership stake in another entity expressed as a property with a bunch of text long enough to make it wrap",
  },
];

export const PropertySelector = forwardRef<
  HTMLInputElement,
  {
    searchText: string;
    onSearchTextChange: (searchText: string) => void;
    modalPopupState: PopupState;
    onAdd: () => void;
    onCancel: () => void;
  }
>(
  (
    { searchText, onSearchTextChange, modalPopupState, onAdd, onCancel },
    ref,
  ) => {
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

    const [open, setOpen] = useState(false);

    const highlightedRef = useRef<null | typeof insertPropertyOptions[number]>(
      null,
    );

    return (
      <Autocomplete
        open={open}
        onOpen={() => setOpen(true)}
        onClose={(_, reason) => {
          if (reason !== "toggleInput") {
            setOpen(false);
          }
        }}
        popupIcon={null}
        clearIcon={null}
        forcePopupIcon={false}
        selectOnFocus={false}
        openOnFocus
        inputValue={searchText}
        clearOnBlur={false}
        onInputChange={(_, value) => onSearchTextChange(value)}
        onHighlightChange={(_, value) => {
          highlightedRef.current = value;
        }}
        onChange={() => onAdd()}
        onKeyDown={(evt) => {
          switch (evt.key) {
            case "Enter":
              if (!highlightedRef.current) {
                modalPopupState.open();
              }
              break;
            case "Escape":
              onCancel();
              break;
          }
        }}
        onBlur={() => {
          if (!modalPopupState.isOpen) {
            onCancel();
          }
        }}
        renderInput={(props) => (
          <TextField
            {...props}
            placeholder="Search for a property type"
            sx={{
              width: "100%",
            }}
            inputRef={ref}
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
                height: PROPERTY_SELECTOR_HEIGHT,

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
        options={insertPropertyOptions}
        getOptionLabel={(obj) => obj.title}
        renderOption={(props, option) => (
          <li {...props}>
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
                    {option.title}
                  </Typography>
                  <ArrowUpRightIcon />
                </Box>
                <OntologyChip
                  icon={option.icon}
                  domain={option.domain}
                  path={
                    <Typography
                      component="span"
                      fontWeight="bold"
                      color={(theme) => theme.palette.blue[70]}
                    >
                      {option.path}
                    </Typography>
                  }
                  sx={{ flexShrink: 1, ml: 1.25, mr: 2 }}
                />
                <Box ml="auto">
                  {option.expectedValues.map((value) => (
                    <Chip key={value} color="gray" label={value} />
                  ))}
                </Box>
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
                {option.description}
              </Typography>
            </Box>
          </li>
        )}
        PaperComponent={PropertyListSelectorDropdown}
        componentsProps={{
          popper: { modifiers },
        }}
      />
    );
  },
);
