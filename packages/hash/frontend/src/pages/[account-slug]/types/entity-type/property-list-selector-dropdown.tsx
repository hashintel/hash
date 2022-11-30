import { Button, ButtonProps, Chip } from "@hashintel/hash-design-system";
import { PaperProps, Typography } from "@mui/material";
import { createContext, useContext } from "react";
import { AutocompleteDropdown } from "./autocomplete-dropdown";
import { StyledPlusCircleIcon } from "./styled-plus-circle-icon";

type PropertyListSelectorDropdownProps = {
  query: string;
  createButtonProps: Omit<ButtonProps, "children" | "variant" | "size">;
};

export const PropertyListSelectorDropdownContext =
  createContext<PropertyListSelectorDropdownProps | null>(null);

const usePropertyListSelectorDropdownContext = () => {
  const value = useContext(PropertyListSelectorDropdownContext);
  if (value === null) {
    throw new Error(
      "Must wrap with PropertyListSelectorDropdownContext.Provider",
    );
  }
  return value;
};

export const PropertyListSelectorDropdown = ({
  children,
  ...props
}: PaperProps) => {
  const { query, createButtonProps } = usePropertyListSelectorDropdownContext();

  return (
    <AutocompleteDropdown {...props}>
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
        <Chip color="purple" label="PROPERTY TYPE" sx={{ ml: 1.5 }} />
      </Button>
    </AutocompleteDropdown>
  );
};
