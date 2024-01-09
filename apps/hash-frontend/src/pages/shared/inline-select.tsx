import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, Select, SelectProps } from "@hashintel/design-system";
import { inputBaseClasses, selectClasses, styled } from "@mui/material";
import { Ref } from "react";

const InlineSelectChevronDown = () => (
  <FontAwesomeIcon
    icon={faCaretDown}
    sx={{ fontSize: 12, position: "absolute", top: 3, right: 14 }}
  />
);

export const InlineSelect = styled(
  <T extends {}>(props: SelectProps<T> & { ref?: Ref<HTMLSelectElement> }) => (
    <Select
      variant="standard"
      disableUnderline
      IconComponent={InlineSelectChevronDown}
      {...props}
    />
  ),
)(({ theme }) => ({
  position: "relative",
  top: 1,
  svg: {
    fontSize: 12,
    marginRight: 0.5,
    position: "relative",
    top: -1,
  },
  [`.${selectClasses.select}.${inputBaseClasses.input}`]: {
    fontSize: 12,
    height: 12,
    fontWeight: 500,
    color: theme.palette.gray[90],
    minHeight: "unset",
    paddingRight: 18,
    "&:focus": {
      background: "transparent",
    },
  },
}));
