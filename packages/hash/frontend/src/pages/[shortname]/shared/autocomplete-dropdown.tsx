import { textFieldBorderRadius } from "@hashintel/hash-design-system";
import { autocompleteClasses, Box, Paper, PaperProps } from "@mui/material";

import { popperPlacementSelectors } from "./popper-placement-modifier";

export const AutocompleteDropdown = ({
  children,
  inputHeight = 0,
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
          height: `calc(100% + ${inputHeight}px)`,
          boxShadow: theme.boxShadows.md,
          pointerEvents: "none",
          borderRadius: `${textFieldBorderRadius}px`,
          [`${popperPlacementSelectors.top} &`]: {
            bottom: -inputHeight,
          },
          [`${popperPlacementSelectors.topStart} &`]: {
            bottom: -inputHeight,
          },
          [`${popperPlacementSelectors.bottom} &`]: {
            top: -inputHeight,
          },
          [`${popperPlacementSelectors.bottomStart} &`]: {
            top: -inputHeight,
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

            [`&[aria-selected="true"]`]: {
              backgroundColor: `${theme.palette.blue[20]} !important`,
            },

            "&.Mui-focused": {
              backgroundColor: `${theme.palette.gray[10]} !important`,

              [`&[aria-selected="true"]`]: {
                backgroundColor: `${theme.palette.gray[20]} !important`,
              },
            },
          },
        })}
      >
        {children}
      </Paper>
    </>
  );
};
