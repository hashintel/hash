import {
  faArrowDownAZ,
  faArrowUpZA,
  faQuestionCircle,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import {
  Box,
  ListItemIcon,
  ListItemText,
  Menu,
  Tooltip,
  Typography,
} from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import { FunctionComponent } from "react";

import { MenuItem } from "../../../ui";

export type SortType = "asc" | "desc" | "recent" | "most_used" | "least_used";

type SortActionsDropdownProps = {
  setSortType: (sortType: SortType) => void;
  activeSortType: SortType;
  popupState: PopupState;
};

// Commented out menu items whose functionality have not been
// implemented yet
// @todo uncomment when functionality has been implemented
const menuItems: {
  title: string;
  sortType: SortType;
  icon: IconDefinition;
}[] = [
  {
    title: "Alphabetical",
    icon: faArrowDownAZ,
    sortType: "asc",
  },
  {
    title: "Reverse Alphabetical",
    icon: faArrowUpZA,
    sortType: "desc",
  },
  // {
  //   title: "Recently Updated",
  //   icon: faWandSparkles, // @todo-mui get a free icon that matches the design closely
  //   sortType: "recent",
  // },
  // {
  //   title: "Most used",
  //   icon: faArrowUpWideShort,
  //   sortType: "most_used",
  // },
  // {
  //   title: "Least used",
  //   sortType: "least_used",
  //   icon: faArrowDownShortWide,
  // },
];

export const SortActionsDropdown: FunctionComponent<
  SortActionsDropdownProps
> = ({ setSortType, activeSortType, popupState }) => {
  return (
    <Menu {...bindMenu(popupState)}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        pl={1.75}
        pr={1.25}
        py={1.25}
      >
        <Typography
          variant="smallCaps"
          sx={({ palette }) => ({
            color: palette.gray[50],
            fontWeight: 600,
          })}
        >
          Sort By
        </Typography>
        <Tooltip title="Sort">
          <FontAwesomeIcon
            icon={faQuestionCircle} // @todo-mui get a free icon that matches the design closely
            sx={({ palette }) => ({
              color: palette.gray[50],
              fontSize: 16,
            })}
          />
        </Tooltip>
      </Box>
      {menuItems.map(({ icon, title, sortType }) => (
        <MenuItem
          key={sortType}
          onClick={() => {
            setSortType(sortType);
            popupState.close();
          }}
          selected={activeSortType === sortType}
        >
          <ListItemIcon>
            <FontAwesomeIcon icon={icon} />
          </ListItemIcon>
          <ListItemText primary={title} />
        </MenuItem>
      ))}
    </Menu>
  );
};
