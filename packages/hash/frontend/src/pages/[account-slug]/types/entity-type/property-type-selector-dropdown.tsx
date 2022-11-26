import {
  Button,
  Chip,
  textFieldBorderRadius,
} from "@hashintel/hash-design-system";
import {
  autocompleteClasses,
  Box,
  Paper,
  PaperProps,
  Typography,
} from "@mui/material";
import { createContext, useContext } from "react";
import { PropertyTypeCustomMenu } from "./custom-property-type-menu";
import { PROPERTY_SELECTOR_HEIGHT } from "./property-selector";
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
    <>
      <Box
        sx={(theme) => ({
          position: "absolute",
          left: 0,
          right: 0,
          width: "100%",
          height: `calc(100% + ${PROPERTY_SELECTOR_HEIGHT}px)`,
          boxShadow: theme.boxShadows.md,
          pointerEvents: "none",
          borderRadius: `${textFieldBorderRadius}px`,
          [`[data-popper-placement="top"] &`]: {
            bottom: -PROPERTY_SELECTOR_HEIGHT,
          },
          [`[data-popper-placement="bottom"] &`]: {
            top: -PROPERTY_SELECTOR_HEIGHT,
          },
        })}
        aria-hidden
      />
      <Paper
        {...props}
        sx={(theme) => ({
          p: 1,
          border: 1,
          boxSizing: "border-box",
          borderColor: theme.palette.gray[30],
          boxShadow: "none",
          [`[data-popper-placement="top"] &`]: {
            borderBottom: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          },
          [`[data-popper-placement="bottom"] &`]: {
            borderTop: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          },

          [`.${autocompleteClasses.listbox}`]: { p: 0 },
          [`.${autocompleteClasses.noOptions}`]: { display: "none" },
          [`.${autocompleteClasses.option}`]: {
            borderRadius: 1,
            "&.Mui-focused": {
              backgroundColor: `${theme.palette.gray[10]} !important`,
            },
          },
        })}
      >
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
      </Paper>
    </>
  );
};
