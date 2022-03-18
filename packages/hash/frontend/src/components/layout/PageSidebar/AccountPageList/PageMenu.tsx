import { VFC } from "react";
import {
  Divider,
  ListItemIcon,
  listItemIconClasses,
  ListItemText,
  listItemTextClasses,
  Menu,
  MenuItem,
} from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import {
  faArrowRight,
  faBookmark,
  faCopy,
  faEyeSlash,
  faLink,
  faPencil,
} from "@fortawesome/free-solid-svg-icons";
import { faFileAlt, faTrashCan } from "@fortawesome/free-regular-svg-icons";
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
    icon: faFileAlt,
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
    <Menu {...bindMenu(popupState)}>
      {menuItems.map(({ title, icon, type, id }, index) => {
        if (type === "divider") {
          return <Divider key={id} />;
        }
        return (
          <MenuItem
            key={id}
            sx={{
              // @todo-mui MenuItem should have a faded type, which when applied,
              // adds this styling
              ...(index === menuItems.length - 1 && {
                [`& .${listItemTextClasses.primary}`]: {
                  color: ({ palette }) => palette.gray[60],
                },
                [`& .${listItemIconClasses.root}`]: {
                  color: ({ palette }) => palette.gray[40],
                },
              }),
            }}
          >
            <ListItemIcon>
              <FontAwesomeIcon icon={icon!} />
            </ListItemIcon>
            <ListItemText primary={title} />
          </MenuItem>
        );
      })}
    </Menu>
  );
};
