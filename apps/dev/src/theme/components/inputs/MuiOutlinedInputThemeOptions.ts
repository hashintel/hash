import { Components, Theme } from "@mui/material";

export const MuiOutlinedInputThemeOptions: Components<Theme>["MuiOutlinedInput"] =
  {
    defaultProps: {
      notched: false,
    },
    styleOverrides: {
      root: ({ theme }) => ({
        background: "white",
        boxSizing: "border-box",
        // @todo use shadow
        boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.05)",
        // @todo this seems… incorrect
        borderRadius: "106px",
        width: "100%",
        padding: theme.spacing(0, 3),

        "&, &:hover": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.gray[30],
          },
        },
        "&.Mui-focused, &.Mui-focused:hover": {
          "& .MuiOutlinedInput-notchedOutline": {
            border: `3px solid ${theme.palette.yellow[500]}`,
          },
        },
        "&.Mui-error, &.Mui-error:hover": {
          "& .MuiOutlinedInput-notchedOutline": {
            // @todo use theme
            border: `3px solid #E04D82`,
          },
        },
      }),
      input: ({ theme }) => ({
        // @todo check this
        height: "55px",
        padding: theme.spacing(1.5, 0),
        // @todo set this properly
        fontSize: theme.typography.bpBodyCopy.fontSize,
        boxSizing: "border-box",
        color: theme.palette.gray[80],

        "&::placeholder": {
          color: theme.palette.gray[50],
        },
      }),
      notchedOutline: ({ theme }) => ({
        borderColor: theme.palette.gray[30],
      }),
      adornedEnd: ({ theme }) => ({
        "&.Mui-error": {
          svg: {
            // @todo use theme
            color: "#E04D82",
          },
        },
      }),
    },
  };
