import { faAngleDown } from "@fortawesome/free-solid-svg-icons";
import { Components, outlinedInputClasses, Theme } from "@mui/material";
import { FontAwesomeIcon } from "../../../../icons";

// Due to MUI's current Select design, there is a bug
// where the menu list doesn't take up full width whenever there
// is a start or end adornment
// @see https://github.com/mui/material-ui/issues/17799#issuecomment-854046326
// @todo figure out a workaround for this this,
// A possible approach will be to leverage Select's autoWidth prop. Get the
// width of the Select component and set that width on one of it's children
export const MuiSelectThemeOptions: Components<Theme>["MuiSelect"] = {
  defaultProps: {
    IconComponent: (props) => <FontAwesomeIcon icon={faAngleDown} {...props} />,
  },
  styleOverrides: {
    select: ({ theme }) => ({}),
    outlined: ({ theme }) => ({
      [`& ~ .${outlinedInputClasses.notchedOutline}`]: {
        borderColor: theme.palette.gray[30],
        boxShadow: theme.boxShadows.xs,
      },
    }),
    icon: ({ theme }) => ({
      color: theme.palette.gray[50],
      fontSize: 16,
    }),
  },
};
