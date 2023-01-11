import { Components, switchClasses, Theme } from "@mui/material";

const focusBorderOffset = 4;
const focusBorderWidth = 2;

export const MuiSwitchThemeOptions: Components<Theme>["MuiSwitch"] = {
  defaultProps: {
    disableFocusRipple: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ theme, ownerState: { size } }) => {
      const isSmall = size === "small";
      const width = isSmall ? 30 : 44;
      const height = isSmall ? 16 : 24;
      const thumbSize = isSmall ? 12 : 20;
      const gutter = 2; // space between the track and thumb
      const translateDistance = width - thumbSize - 2 * gutter;

      return {
        width,
        height,
        padding: 0,
        overflow: "unset",

        [`& .${switchClasses.thumb}`]: {
          width: thumbSize,
          height: thumbSize,
          boxShadow: `0px 1px 3px rgba(0, 0, 0, 0.1), 0px 1px 2px rgba(0, 0, 0, 0.06)`,
          color: theme.palette.white,
        },

        [`& .${switchClasses.track}`]: {
          borderRadius: height / 2,
          backgroundColor: theme.palette.gray[20],
          opacity: 1,
          transition: theme.transitions.create(["background-color"], {
            duration: 500,
          }),
          position: "relative",
        },

        [`& .${switchClasses.switchBase}`]: {
          padding: 0,
          margin: gutter,
          transitionDuration: "300ms",

          [`&.${switchClasses.checked}`]: {
            transform: `translateX(${translateDistance}px)`,

            [`& + .${switchClasses.track}`]: {
              backgroundColor: theme.palette.blue[70],
              opacity: 1,
              border: 0,
            },

            [`&.${switchClasses.disabled} + .${switchClasses.track}`]: {
              opacity: 0.5,
            },
          },

          [`&.Mui-focusVisible + .${switchClasses.track}:after`]: {
            content: `""`,
            position: "absolute",
            top: -focusBorderOffset,
            left: -focusBorderOffset,
            right: -focusBorderOffset,
            bottom: -focusBorderOffset,
            borderWidth: focusBorderWidth,
            borderStyle: "solid",
            borderRadius: thumbSize / 2 + focusBorderOffset,
            borderColor: theme.palette.blue[70],
          },

          [`&.${switchClasses.disabled} .${switchClasses.thumb}`]: {
            color: theme.palette.grey[100],
          },

          [`&.${switchClasses.disabled} + .${switchClasses.track}`]: {
            opacity: 0.7,
          },
        },
      };
    },
  },
};
