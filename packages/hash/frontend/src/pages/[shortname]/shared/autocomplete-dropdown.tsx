import { textFieldBorderRadius } from "@hashintel/hash-design-system";
import { autocompleteClasses, Box, Paper, PaperProps } from "@mui/material";

export const AutocompleteDropdown = ({
  buttonHeight = 0,
  children,
  ...props
}: PaperProps & { buttonHeight?: number }) => {
  return (
    <>
      <Box
        sx={(theme) => ({
          position: "absolute",
          left: 0,
          right: 0,
          width: "100%",
          height: `calc(100% + ${buttonHeight}px)`,
          boxShadow: theme.boxShadows.md,
          pointerEvents: "none",
          borderRadius: `${textFieldBorderRadius}px`,
          [`[data-popper-placement="top"] &`]: {
            bottom: -buttonHeight,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          },
          [`[data-popper-placement="top-start"] &`]: {
            bottom: -buttonHeight,
            borderBottomLeftRadius: 0,
          },
          [`[data-popper-placement="bottom"] &`]: {
            top: -buttonHeight,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          },
          [`[data-popper-placement="bottom-start"] &`]: {
            top: -buttonHeight,
            borderTopRightRadius: 0,
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
          [`[data-popper-placement="top-start"] &`]: {
            borderBottom: 0,
            borderBottomLeftRadius: 0,
          },
          [`[data-popper-placement="bottom"] &`]: {
            borderTop: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          },
          [`[data-popper-placement="bottom-start"] &`]: {
            borderTop: 0,
            borderTopLeftRadius: 0,
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
      </Paper>
    </>
  );
};
