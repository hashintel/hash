import { Button, Chip } from "@hashintel/hash-design-system";
import { PaperProps, Typography } from "@mui/material";
import { createContext, useContext } from "react";
import { AutocompleteDropdown } from "./autocomplete-dropdown";
import { CustomDataTypeMenu } from "./custom-data-type-menu";
import { StyledPlusCircleIcon } from "./styled-plus-circle-icon";

type DataTypeSelectorDropdownProps = {
  customDataTypeMenuOpen: boolean;
  openCustomDataTypeMenu: () => void;
  closeCustomDataTypeMenu: () => void;
};

export const DataTypeSelectorDropdownContext =
  createContext<DataTypeSelectorDropdownProps | null>(null);

export const useDataTypeSelectorDropdownContext = () => {
  const value = useContext(DataTypeSelectorDropdownContext);
  if (value === null) {
    throw new Error("Must wrap with DataTypeSelectorDropdownContext.Provider");
  }
  return value;
};

export const DataTypeSelectorDropdown = ({
  children,
  ...props
}: PaperProps) => {
  const {
    customDataTypeMenuOpen,
    openCustomDataTypeMenu,
    closeCustomDataTypeMenu,
  } = useDataTypeSelectorDropdownContext();

  return (
    <AutocompleteDropdown {...props}>
      {customDataTypeMenuOpen ? (
        <CustomDataTypeMenu closeMenu={closeCustomDataTypeMenu} />
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
            onClick={openCustomDataTypeMenu}
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
