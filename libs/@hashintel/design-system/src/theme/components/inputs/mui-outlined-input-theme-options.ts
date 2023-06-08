import {
  Components,
  inputAdornmentClasses,
  outlinedInputClasses,
  Theme,
} from "@mui/material";

export const textFieldBorderRadius = 6;

export const MuiOutlinedInputThemeOptions: Components<Theme>["MuiOutlinedInput"] =
  {
    defaultProps: {
      notched: false,
    },
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: `${textFieldBorderRadius}px`,
        paddingLeft: 0,
        paddingRight: 0,
        boxShadow: theme.boxShadows.xs,
        backgroundColor: theme.palette.white,

        "&.Mui-focused, &.Mui-focused:hover": {
          [`& .${outlinedInputClasses.notchedOutline}`]: {
            borderColor: theme.palette.blue[60],
          },
        },

        [`.${inputAdornmentClasses.root}`]: {
          height: "unset",
          maxHeight: "unset",
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          color: theme.palette.gray[40],
          margin: 0,
          padding: 0,
          "& svg": { fontSize: 16 },

          [`&.${inputAdornmentClasses.positionStart}`]: {
            borderTopLeftRadius: `${textFieldBorderRadius}px`,
            borderBottomLeftRadius: `${textFieldBorderRadius}px`,
            paddingLeft: theme.spacing(2),
            marginRight: theme.spacing(1.5),
          },

          [`&.${inputAdornmentClasses.positionEnd}`]: {
            borderTopRightRadius: `${textFieldBorderRadius}px`,
            borderBottomRightRadius: `${textFieldBorderRadius}px`,
            paddingRight: theme.spacing(2),
            marginLeft: theme.spacing(1.5),
          },
        },
      }),
      input: ({ theme, ownerState = {} }) => {
        const { error, size, startAdornment, endAdornment } = ownerState;
        const hasStartAdornment = Boolean(startAdornment);
        const hasEndAdornment = Boolean(endAdornment);
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

          ...(size === "xs" && {
            ...theme.typography.smallTextLabels,
            padding: theme.spacing(1, 1.5),
            ...(hasStartAdornment && { paddingLeft: theme.spacing(0) }),
            ...(hasEndAdornment && { paddingRight: theme.spacing(0) }),
          }),
          ...(size === "small" && {
            ...theme.typography.smallTextLabels,
            padding: theme.spacing(1.5, 2),
            ...(hasStartAdornment && { paddingLeft: theme.spacing(0.5) }),
            ...(hasEndAdornment && { paddingRight: theme.spacing(0.5) }),
          }),
          ...(size === "medium" && {
            ...theme.typography.regularTextLabels,
            padding: theme.spacing(1.5, 2),
            ...(hasStartAdornment && { paddingLeft: theme.spacing(0.5) }),
            ...(hasEndAdornment && { paddingRight: theme.spacing(0.5) }),
          }),
          ...(size === "large" && {
            ...theme.typography.regularTextLabels,
            padding: theme.spacing(1.5, 2.5),
            ...(hasStartAdornment && { paddingLeft: theme.spacing(1) }),
            ...(hasEndAdornment && { paddingRight: theme.spacing(1) }),
          }),
        };
      },
      multiline: ({ theme }) => ({
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,

        [`& .${outlinedInputClasses.input}`]: {
          paddingLeft: theme.spacing(2),
          paddingRight: theme.spacing(2),
        },
      }),
    },
  };
