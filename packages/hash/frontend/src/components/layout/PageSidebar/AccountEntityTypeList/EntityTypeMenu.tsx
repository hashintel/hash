import { useMemo, useState, VFC } from "react";
import {
  faLink,
  faAdd,
  faBookmark,
  faTrash,
  faFilter,
} from "@fortawesome/free-solid-svg-icons";
import pluralize from "pluralize";
import {
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  listItemTextClasses,
  listItemIconClasses,
} from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/core";
import { FontAwesomeIcon } from "../../../icons";
import { Link } from "../../../Link";

type EntityTypeMenuProps = {
  popupState: PopupState;
  accountId: string;
  entityId: string;
  entityTitle: string;
};

export const EntityTypeMenu: VFC<EntityTypeMenuProps> = ({
  popupState,
  accountId,
  entityId,
  entityTitle,
}) => {
  const [copied, setCopied] = useState(false);

  const menuItems = useMemo(() => {
    return [
      {
        id: 1,
        title: "Add to Bookmarks",
        icon: faBookmark, // @todo-mui get a free icon that matches the design closely
        onClick: () => {
          popupState.close();
        },
      },
      {
        id: 2,
        title: `Create new ${pluralize.singular(entityTitle)}`,
        icon: faAdd,
        href: `/${accountId}/entities/new?entityTypeId=${entityId}`,
      },
      {
        id: 3,
        title: copied ? "Copied!" : `Copy Link to ${entityTitle}`,
        icon: faLink,
        onClick: () => {
          void navigator.clipboard.writeText(
            `${window.location.origin}/${accountId}/types/${entityId}`,
          );
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
            popupState.close();
          }, 1000);
          // @todo-mui add some visual feedback to sure it's been copied
        },
      },
      {
        id: 4,
        title: "Create filtered page",
        icon: faFilter, // @todo-mui get a free icon that matches the design closely
        onClick: () => {
          popupState.close();
        },
      },
      {
        id: 5,
        title: "Delete type",
        icon: faTrash,
        onClick: () => {
          popupState.close();
        },
        faded: true,
      },
    ];
  }, [accountId, entityId, entityTitle, copied, popupState]);

  return (
    <Menu {...bindMenu(popupState)}>
      {menuItems.map(({ title, icon, onClick, href, id, faded }) => {
        if (href) {
          return (
            <MenuItem key={id} onClick={() => popupState.close()}>
              <Link sx={{ display: "flex" }} key={id} noLinkStyle href={href}>
                <ListItemIcon>
                  <FontAwesomeIcon icon={icon} />
                </ListItemIcon>
                <ListItemText primary={title} />
              </Link>
            </MenuItem>
          );
        }
        if (onClick) {
          return (
            <MenuItem
              key={id}
              sx={{
                ...(Boolean(faded) && {
                  [`& .${listItemTextClasses.primary}`]: {
                    color: ({ palette }) => palette.gray[50],
                  },
                  [`& .${listItemIconClasses.root}`]: {
                    color: ({ palette }) => palette.gray[40],
                  },
                }),
              }}
              onClick={onClick}
            >
              <ListItemIcon>
                <FontAwesomeIcon icon={icon} />
              </ListItemIcon>
              <ListItemText primary={title} />
            </MenuItem>
          );
        }
        return null;
      })}
    </Menu>
  );
};
