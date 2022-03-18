import { VFC } from "react";
import { Divider, ListItemIcon, Menu, MenuItem } from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import {
  faArrowRight,
  faBookmark,
  faCopy,
  faEyeSlash,
  faLink,
  faPencil,
} from "@fortawesome/free-solid-svg-icons";
import { faTrashCan } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "../../../icons";

type PageMenuProps = {
  popupState: PopupState;
};

const menuItems = [
  {
    id: 1,
    title: "Add to bookmarks",
    icon: faBookmark,
  },
  {
    id: 2,
    title: "Add subpage",
    icon: faBookmark,
  },
  {
    id: 3,
    title: "Copy link to page",
    icon: faLink,
  },
  {
    id: 4,
    title: "Duplicate Page",
    icon: faCopy,
  },
  {
    id: 5,
    title: "Rename Page",
    icon: faPencil,
  },
  {
    id: 6,
    title: "Move Page",
    icon: faArrowRight,
  },
  {
    id: 7,
    title: "Make private",
    icon: faEyeSlash,
  },
  {
    id: 8,
    type: "divider",
  },
  {
    id: 9,
    title: "Delete",
    icon: faTrashCan,
  },
];

export const PageMenu: VFC<PageMenuProps> = ({ popupState }) => {
  return (
    <Menu
      {...bindMenu(popupState)}
      PaperProps={{
        sx: {
          minWidth: 240,
        },
      }}
    >
      {menuItems.map(({ title, icon, type, id }) => {
        if (type === "divider") {
          return <Divider key={id} />;
        }
        return (
          <MenuItem key={id}>
            <ListItemIcon>
              <FontAwesomeIcon icon={icon} />
            </ListItemIcon>
            {title}
          </MenuItem>
        );
      })}
    </Menu>
  );
};
