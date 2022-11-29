import {
  Button,
  ButtonProps,
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
    <>
      <Box
        sx={(theme) => ({
          position: "absolute",
          left: 0,
          right: 0,
          width: "100%",
          height: `calc(100% + ${TYPE_SELECTOR_HEIGHT}px)`,
          boxShadow: theme.boxShadows.md,
          pointerEvents: "none",
          borderRadius: `${textFieldBorderRadius}px`,
          [`[data-popper-placement="top"] &`]: {
            bottom: -TYPE_SELECTOR_HEIGHT,
          },
          [`[data-popper-placement="bottom"] &`]: {
            top: -TYPE_SELECTOR_HEIGHT,
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
      </Paper>
    </>
  );
};
