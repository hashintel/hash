import { Components, outlinedInputClasses, Theme } from "@mui/material";

export const MuiOutlinedInputThemeOptions: Components<Theme>["MuiOutlinedInput"] =
  {
    defaultProps: {
      notched: false,
    },
    styleOverrides: {
      root: ({ theme }) => ({
        color: "inherit",
        lineHeight: "18px",
        borderRadius: "6px",
        "&:hover": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.gray[30],
          },
        },
        paddingRight: "unset",
        paddingLeft: theme.spacing(1.5),
        "&.Mui-focused": {
          [`& .${outlinedInputClasses.notchedOutline}`]: {
            borderWidth: "2px",
            borderColor: theme.palette.blue[70],
          },
        },
        "&.Mui-error": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.palette.red[60],
          },
        },
      }),
      input: ({ theme }) => ({
        padding: theme.spacing(1, 1),
      }),
      notchedOutline: ({ theme }) => ({
        borderColor: theme.palette.gray[30],
      }),
      adornedEnd: ({ theme }) => ({
        "&.Mui-error": {
          svg: {
            color: theme.palette.red[60],
          },
        },
      }),
    },
  };
