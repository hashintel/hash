import { EntityType } from "@blockprotocol/type-system-web";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, TextField } from "@hashintel/hash-design-system";
import {
  Autocomplete,
  Box,
  outlinedInputClasses,
  PopperProps,
  Typography,
} from "@mui/material";
import { FunctionComponent, useMemo, useRef, useState } from "react";
import { ArrowUpRightIcon } from "../../../../shared/icons/svg";
import {
  OntologyChip,
  parseUriForOntologyChip,
} from "../../shared/ontology-chip";
import {
  TypeListSelectorDropdown,
  TypeListSelectorDropdownContext,
  TYPE_SELECTOR_HEIGHT,
} from "./type-list-selector-dropdown";
import { useEntityTypes } from "./use-entity-types";

export const EntityTypeSelector: FunctionComponent<{
  onSelect: (entityType: EntityType) => void;
  onCancel: () => void;
  onCreateNew: (searchValue: string) => void;
}> = ({ onCancel, onSelect, onCreateNew }) => {
  const [search, setSearch] = useState("");
  const entityTypesObject = useEntityTypes();
  const entityTypes = Object.values(entityTypesObject ?? {});

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
  const highlightedRef = useRef<null | EntityType>(null);

  return (
    <TypeListSelectorDropdownContext.Provider
      // eslint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        query: search,
        createButtonProps: {
          onMouseDown: (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            onCreateNew(search);
          },
        },
        variant: "entityType",
      }}
    >
      <Autocomplete
        /**
         * @todo make this Autocomplete reusable
         * This is almost a duplicate of `PropertySelector`
         */
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
        inputValue={search}
        clearOnBlur={false}
        onInputChange={(_, value) => setSearch(value)}
        onHighlightChange={(_, value) => {
          highlightedRef.current = value;
        }}
        onChange={(_, option) => {
          if (option) {
            onSelect(option);
          }
        }}
        onKeyUp={(evt) => {
          if (evt.key === "Enter" && !highlightedRef.current) {
            onCreateNew(search);
          }
        }}
        onKeyDown={(evt) => {
          if (evt.key === "Escape") {
            onCancel();
          }
        }}
        onBlur={() => {
          onCancel();
        }}
        renderInput={(props) => (
          <TextField
            {...props}
            placeholder="Search for a entity type"
            sx={{
              width: "100%",
            }}
            autoFocus
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
        options={entityTypes}
        getOptionLabel={(obj) => obj.title}
        renderOption={(props, property: EntityType) => {
          const ontology = parseUriForOntologyChip(property.$id);

          // @todo extract component
          return (
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
                      {property.title}
                    </Typography>
                    <ArrowUpRightIcon />
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
                  {property.description}
                </Typography>
              </Box>
            </li>
          );
        }}
        sx={{ width: "100%", maxWidth: 440 }}
        PaperComponent={TypeListSelectorDropdown}
        componentsProps={{
          popper: { modifiers },
        }}
      />
    </TypeListSelectorDropdownContext.Provider>
  );
};
