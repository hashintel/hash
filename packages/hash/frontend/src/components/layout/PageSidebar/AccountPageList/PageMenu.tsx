import { VFC, useMemo, useState } from "react";
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
import { useRouter } from "next/router";
import { FontAwesomeIcon } from "../../../icons";

type PageMenuProps = {
  popupState: PopupState;
  entityId: string;
};

export const PageMenu: VFC<PageMenuProps> = ({ popupState, entityId }) => {
  const [copied, setCopied] = useState(false);
  const { query } = useRouter();
  const accountId = query.accountId as string;

  const menuItems = useMemo(
    () => [
      {
        id: 1,
        title: "Add to bookmarks",
        icon: faBookmark,
        onClick: () => {
          popupState.close();
        },
      },
      {
        id: 2,
        title: "Add subpage",
        icon: faFileAlt,
        onClick: () => {
          popupState.close();
        },
      },
      {
        id: 3,
        title: "Copy link to page",
        icon: faLink,
        onClick: () => {
          void navigator.clipboard.writeText(
            `${window.location.origin}/${accountId}/${entityId}`,
          );
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
            popupState.close();
          }, 1000);
        },
      },
      {
        id: 4,
        title: "Duplicate Page",
        icon: faCopy,
        onClick: () => {
          popupState.close();
        },
      },
      {
        id: 5,
        title: "Rename Page",
        icon: faPencil,
        onClick: () => {
          popupState.close();
        },
      },
      {
        id: 6,
        title: "Move Page",
        icon: faArrowRight,
        onClick: () => {
          popupState.close();
        },
      },
      {
        id: 7,
        title: "Make private",
        icon: faEyeSlash,
        onClick: () => {
          popupState.close();
        },
      },
      {
        id: 8,
        type: "divider",
      },
      {
        id: 9,
        title: "Delete",
        icon: faTrashCan,
        onClick: () => {
          popupState.close();
        },
      },
    ],
    [copied, popupState],
  );
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
