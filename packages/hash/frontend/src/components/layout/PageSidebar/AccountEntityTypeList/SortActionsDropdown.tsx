import { VFC } from "react";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import {
  Box,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  faArrowDownAZ,
  faArrowDownShortWide,
  faArrowUpWideShort,
  faArrowUpZA,
  faQuestionCircle,
  faWandSparkles,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "../../../icons";

export type SortType = "asc" | "desc" | "recent" | "most_used" | "least_used";

type SortActionsDropdownProps = {
  setSortType: (sortType: SortType) => void;
  activeSortType: SortType;
  popupState: PopupState;
};

const menuItems: {
  id: number;
  title: string;
  sortType: SortType;
  icon: IconDefinition;
}[] = [
  {
    id: 1,
    title: "Alphabetical",
    icon: faArrowDownAZ,
    sortType: "asc",
  },
  {
    id: 2,
    title: "Reverse Alphabetical",
    icon: faArrowUpZA,
    sortType: "desc",
  },
  {
    id: 3,
    title: "Recently Updated",
    icon: faWandSparkles, // @todo-mui get a free icon that matches the design closely
    sortType: "recent",
  },
  {
    id: 4,
    title: "Most used",
    icon: faArrowUpWideShort,
    sortType: "most_used",
  },
  {
    id: 5,
    title: "Least used",
    sortType: "least_used",
    icon: faArrowDownShortWide,
  },
];

export const SortActionsDropdown: VFC<SortActionsDropdownProps> = ({
  setSortType,
  activeSortType,
  popupState,
}) => {
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
            icon={faQuestionCircle}
            sx={({ palette }) => ({
              color: palette.gray[50],
              fontSize: 16,
            })}
          />
        </Tooltip>
      </Box>
      {menuItems.map(({ id, icon, title, sortType }) => (
        <MenuItem
          key={id}
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
