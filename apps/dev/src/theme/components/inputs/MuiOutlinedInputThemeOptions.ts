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
        borderRadius: "6px",
        "&:hover": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.gray[30],
          },
        },
        "&.Mui-focused": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.purple[600],
          },
        },
        "&.Mui-error": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.red[600],
          },
        },
      }),
      input: ({ theme }) => ({
        padding: theme.spacing(1.5, 2),
        fontSize: theme.typography.bpBodyCopy.fontSize,
      }),
      notchedOutline: ({ theme }) => ({
        borderColor: theme.palette.gray[30],
      }),
      adornedEnd: ({ theme }) => ({
        "&.Mui-error": {
          svg: {
            color: theme.palette.red[600],
          },
        },
      }),
    },
  };
