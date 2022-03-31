/**
 * @todo update from blockprotocol
 */
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

        "& .MuiOutlinedInput-notchedOutline": {
          border: `1px solid ${theme.palette.gray[30]}`,
        },
        "&:hover": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.gray[30],
          },
        },
        "&.Mui-focused": {
          "& .MuiOutlinedInput-notchedOutline": {
            border: `3px solid ${theme.palette.yellow[500]}`,
          },
        },
        "&.Mui-error": {
          "& .MuiOutlinedInput-notchedOutline": {
            // borderColor: theme.palette.red[600],
          },
        },
      }),
      input: ({ theme }) => ({
        // @todo check this
        height: "55px",
        padding: theme.spacing(1.5, 3),
        fontSize: theme.typography.bpBodyCopy.fontSize,
        boxSizing: "border-box",

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
            // color: theme.palette.red[600],
          },
        },
      }),
    },
  };
