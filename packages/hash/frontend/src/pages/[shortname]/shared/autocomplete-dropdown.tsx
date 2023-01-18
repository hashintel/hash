import { textFieldBorderRadius } from "@hashintel/hash-design-system";
import { autocompleteClasses, Box, Paper, PaperProps } from "@mui/material";

import { popperPlacementSelectors } from "./popper-placement-modifier";

export const AutocompleteDropdown = ({
  inputHeight = 0,
  joined = false,
  children,
  ...props
}: PaperProps & { inputHeight?: number; joined?: boolean }) => {
  return (
    <>
      <Box
        sx={(theme) => ({
          position: "absolute",
          left: 0,
          right: 0,
          width: "100%",
          height: joined ? "100%" : `calc(100% + ${inputHeight}px)`,
          boxShadow: theme.boxShadows.md,
          pointerEvents: "none",
          borderRadius: `${textFieldBorderRadius}px`,
          [`${popperPlacementSelectors.top} &`]: {
            ...(joined
              ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
              : { bottom: -inputHeight }),
          },
          [`${popperPlacementSelectors.bottom} &`]: {
            ...(joined
              ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 }
              : { top: -inputHeight }),
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
            ...(joined ? { paddingBottom: `${inputHeight}px` } : {}),
          },
          [`${popperPlacementSelectors.bottom} &`]: {
            borderTop: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            ...(joined ? { paddingTop: `${inputHeight}px` } : {}),
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
