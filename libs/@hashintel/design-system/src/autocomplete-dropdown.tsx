import type { PaperProps } from "@mui/material";
import { autocompleteClasses, Box, Paper } from "@mui/material";

import { popperPlacementSelectors } from "./popper-placement-modifier.js";
import { textFieldBorderRadius } from "./theme.js";

export const AutocompleteDropdown = ({
  sx,
  children,
  inputHeight = 0,
  joined = true,
  ...props
}: PaperProps & { inputHeight?: number | string; joined?: boolean }) => {
  return (
    <>
      <Box
        sx={(theme) => ({
          position: "absolute",
          left: 0,
          right: 0,
          width: "100%",
          /** If we have a fixed height, we can stretch the box shadow over the input. If not, don't stretch it */
          height: `calc(100% + ${inputHeight === "auto" ? 0 : inputHeight}px)`,
          boxShadow: theme.boxShadows.md,
          pointerEvents: "none",
          borderRadius: `${textFieldBorderRadius}px`,
          [`${popperPlacementSelectors.top} &`]: {
            bottom: -Number(inputHeight),
          },
          [`${popperPlacementSelectors.topStart} &`]: {
            bottom: -Number(inputHeight),
          },
          [`${popperPlacementSelectors.bottom} &`]: {
            top: -Number(inputHeight),
          },
          [`${popperPlacementSelectors.bottomStart} &`]: {
            top: -Number(inputHeight),
          },
        })}
        aria-hidden
      />
      <Paper
        {...props}
        sx={[
          (theme) => ({
            p: 1,
            border: 1,
            boxSizing: "border-box",
            borderColor: theme.palette.gray[30],
            boxShadow: "none",
            ...(joined
              ? {
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
                }
              : {}),

            [`.${autocompleteClasses.listbox}`]: { p: 0 },
            [`.${autocompleteClasses.noOptions}`]: { fontSize: 14 },
            [`.${autocompleteClasses.option}`]: {
              borderRadius: 1,
              my: 0.25,

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
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
      </Paper>
    </>
  );
};
