import {
  Components,
  Theme,
  outlinedInputClasses,
  inputAdornmentClasses,
} from "@mui/material";

export const MuiOutlinedInputThemeOptions: Components<Theme>["MuiOutlinedInput"] =
  {
    defaultProps: {
      notched: false,
    },
    styleOverrides: {
      root: ({ theme, ownerState = {} }) => ({
        borderRadius: "6px",
        paddingLeft: theme.spacing(2),
        paddingRight: theme.spacing(2),

        ...(ownerState.size === "large" && {
          paddingLeft: theme.spacing(2.5),
          paddingRight: theme.spacing(2),
        }),

        [`& .${outlinedInputClasses.notchedOutline}`]: {
          borderColor: theme.palette.gray[30],
        },

        "&:hover": {
          [`& .${outlinedInputClasses.notchedOutline}`]: {
            borderColor: theme.palette.gray[40],
          },
        },

        "&.Mui-focused": {
          [`& .${outlinedInputClasses.notchedOutline}`]: {
            border: `1px solid ${theme.palette.blue[60]}`,
            boxShadow: `0px 1px 2px rgba(0, 0, 0, 0.05), 0px 0px 0px 1px ${theme.palette.purple[50]}`,
          },
        },

        [`.${inputAdornmentClasses.root}`]: {
          height: "unset",
          maxHeight: "unset",
          "& svg": { color: theme.palette.gray[40], fontSize: 16 },
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

      adornedEnd: ({ theme }) => ({
        "&.Mui-error": {
          svg: {
            color: theme.palette.red[60],
            fontSize: 16,
          },
        },
      }),
    },
  };
