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
        boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.05)",
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
            border: `3px solid ${theme.palette.red[500]}`,
          },
        },
      }),
      input: ({ theme }) => ({
        height: "55px",
        padding: theme.spacing(1.5, 0),
        fontSize: theme.typography.hashBodyCopy.fontSize,
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
            color: theme.palette.red[500],
          },
        },
      }),
    },
  };
