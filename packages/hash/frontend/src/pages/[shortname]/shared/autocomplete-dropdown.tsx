import { textFieldBorderRadius } from "@hashintel/hash-design-system";
import { autocompleteClasses, Box, Paper, PaperProps } from "@mui/material";

import { popperPlacementSelectors } from "./popper-placement-modifier";

export const AutocompleteDropdown = ({
  inputHeight = 0,
  children,
  ...props
}: PaperProps & { inputHeight?: number }) => {
  return (
    <>
      <Box
        sx={(theme) => ({
          position: "absolute",
          left: 0,
          right: 0,
          width: "100%",
          height: `calc(100% - ${inputHeight}px)`,
          boxShadow: theme.boxShadows.md,
          pointerEvents: "none",
          borderRadius: `${textFieldBorderRadius}px`,
          [`${popperPlacementSelectors.top} &`]: {
            top: 0,
          },
          [`${popperPlacementSelectors.topStart} &`]: {
            top: 0,
          },
          [`${popperPlacementSelectors.bottom} &`]: {
            bottom: 0,
          },
          [`${popperPlacementSelectors.bottomStart} &`]: {
            bottom: 0,
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
          [`${popperPlacementSelectors.top} &`]: {
            borderBottom: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          },
          [`${popperPlacementSelectors.topStart} &`]: {
            borderBottom: 0,
            borderBottomLeftRadius: 0,
          },
          [`${popperPlacementSelectors.bottom} &`]: {
            borderTop: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          },
          [`${popperPlacementSelectors.bottomStart} &`]: {
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
