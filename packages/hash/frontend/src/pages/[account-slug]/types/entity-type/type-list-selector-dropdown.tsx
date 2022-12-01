import { Button, ButtonProps, Chip } from "@hashintel/hash-design-system";
import { PaperProps, Typography } from "@mui/material";
import { AutocompleteDropdown } from "./autocomplete-dropdown";
import { StyledPlusCircleIcon } from "./styled-plus-circle-icon";

export type TypeListSelectorDropdownProps = {
  query: string;
  createButtonProps: Omit<ButtonProps, "children" | "variant" | "size">;
  variant: "entityType" | "propertyType";
};

export const TYPE_SELECTOR_HEIGHT = 57;

export const TypeListSelectorDropdown = ({
  children,
  dropdownProps,
  ...props
}: PaperProps & { dropdownProps: TypeListSelectorDropdownProps }) => {
  const { query, createButtonProps, variant } = dropdownProps;

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
        {variant === "entityType" ? (
          <Chip color="teal" label="ENTITY TYPE" sx={{ ml: 1.5 }} />
        ) : (
          <Chip color="purple" label="PROPERTY TYPE" sx={{ ml: 1.5 }} />
        )}
      </Button>
    </AutocompleteDropdown>
  );
};
