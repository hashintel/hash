import { Button, Chip } from "@hashintel/hash-design-system";
import { PaperProps, Typography } from "@mui/material";
import { createContext, useContext } from "react";
import { AutocompleteDropdown } from "./autocomplete-dropdown";
import { PropertyTypeCustomMenu } from "./custom-property-type-menu";
import { StyledPlusCircleIcon } from "./styled-plus-circle-icon";

type PropertyTypeSelectorDropdownProps = {
  customPropertyMenuOpen: boolean;
  openCustomPropertyMenu: () => void;
  closeCustomPropertyMenu: () => void;
};

export const PropertyTypeSelectorDropdownContext =
  createContext<PropertyTypeSelectorDropdownProps | null>(null);

export const usePropertyTypeSelectorDropdownContext = () => {
  const value = useContext(PropertyTypeSelectorDropdownContext);
  if (value === null) {
    throw new Error(
      "Must wrap with PropertyTypeSelectorDropdownContext.Provider",
    );
  }
  return value;
};

export const PropertyTypeSelectorDropdown = ({
  children,
  ...props
}: PaperProps) => {
  const {
    customPropertyMenuOpen,
    openCustomPropertyMenu,
    closeCustomPropertyMenu,
  } = usePropertyTypeSelectorDropdownContext();

  return (
    <AutocompleteDropdown {...props}>
      {customPropertyMenuOpen ? (
        <PropertyTypeCustomMenu closeMenu={closeCustomPropertyMenu} />
      ) : (
        <>
          {children}

          <Button
            variant="tertiary"
            startIcon={<StyledPlusCircleIcon />}
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              mt: 1,
            }}
            onMouseDown={(event) => {
              // prevent dropdown from closing
              event.preventDefault();
            }}
            onClick={openCustomPropertyMenu}
          >
            <Typography
              variant="smallTextLabels"
              sx={(theme) => ({
                color: theme.palette.gray[60],
                fontWeight: 500,
              })}
            >
              Specify a custom expected value
            </Typography>

            <Chip color="purple" label="PROPERTY TYPE" sx={{ ml: 1.5 }} />
          </Button>
        </>
      )}
    </AutocompleteDropdown>
  );
};
