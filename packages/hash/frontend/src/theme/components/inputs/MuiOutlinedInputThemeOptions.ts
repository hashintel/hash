import {
  Components,
  Theme,
  outlinedInputClasses,
  inputAdornmentClasses,
} from "@mui/material";

const textFieldBorderRadius = 6;

export const MuiOutlinedInputThemeOptions: Components<Theme>["MuiOutlinedInput"] =
  {
    defaultProps: {
      notched: false,
    },
    styleOverrides: {
      root: ({ theme, ownerState = {} }) => ({
        borderRadius: `${textFieldBorderRadius}px`,
        paddingLeft: theme.spacing(2),
        paddingRight: theme.spacing(2),
        boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.05)", // this should be part of our shadows

        ...(ownerState.size === "large" && {
          paddingLeft: theme.spacing(2.5),
          paddingRight: theme.spacing(2),
        }),

        "&.Mui-focused, &.Mui-focused:hover": {
          [`& .${outlinedInputClasses.notchedOutline}`]: {
            border: `1px solid ${theme.palette.blue[60]}`,
            boxShadow: `0px 1px 2px rgba(0, 0, 0, 0.05), 0px 0px 0px 1px ${theme.palette.purple[50]}`,
          },
        },

        [`.${inputAdornmentClasses.root}`]: {
          height: "unset",
          maxHeight: "unset",
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          color: theme.palette.gray[40],
          "& svg": { fontSize: 16 },
        },
      }),
      input: ({ theme, ownerState = {} }) => {
        const { error, size } = ownerState;
        return {
          color: theme.palette.gray[80],
          height: "unset",

          "&::placeholder": {
            color: theme.palette.gray[50],
            opacity: 1,
          },

          ...(error && {
            color: theme.palette.red[80],
          }),

          ...(size === "small" && {
            ...theme.typography.smallTextLabels,
            padding: theme.spacing(1.5, 0),
          }),
          ...(size === "medium" && {
            ...theme.typography.regularTextLabels,
            padding: theme.spacing(1, 0),
          }),
          ...(size === "large" && {
            ...theme.typography.regularTextLabels,
            padding: theme.spacing(1.5, 0),
          }),
        };
      },
      adornedStart: ({ theme }) => ({
        paddingLeft: "unset",
        [`& .${inputAdornmentClasses.root}`]: {
          paddingLeft: theme.spacing(2),
          borderTopLeftRadius: `${textFieldBorderRadius}px`,
          borderBottomLeftRadius: `${textFieldBorderRadius}px`,
          marginRight: theme.spacing(1.5),
        },
      }),
      adornedEnd: ({ theme }) => ({
        paddingRight: "unset",
        [`& .${inputAdornmentClasses.root}`]: {
          paddingRight: theme.spacing(2),
          borderTopRightRadius: `${textFieldBorderRadius}px`,
          borderBottomRightRadius: `${textFieldBorderRadius}px`,
          marginLeft: theme.spacing(1.5),
        },
      }),
    },
  };
