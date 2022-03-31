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
import { Link } from "../../../../shared/ui";

type EntityTypeMenuProps = {
  popupState: PopupState;
  accountId: string;
  entityId: string;
  entityTitle: string;
};

// @todo-mui get free icons that matches the design closely
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
        title: "Add to Bookmarks",
        icon: faBookmark,
      },
      {
        title: `Create new ${pluralize.singular(entityTitle)}`,
        icon: faAdd,
        href: `/${accountId}/entities/new?entityTypeId=${entityId}`,
      },
      {
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
          }, 2000);
        },
      },
      {
        title: "Create filtered page",
        icon: faFilter,
      },
      {
        title: "Delete type",
        icon: faTrash,
        faded: true,
      },
    ];
  }, [accountId, entityId, entityTitle, copied, popupState]);

  return (
    <Menu {...bindMenu(popupState)}>
      {menuItems.map(({ title, icon, onClick, href, faded }, index) => {
        if (href) {
          return (
            // eslint-disable-next-line react/no-array-index-key
            <MenuItem key={index} onClick={() => popupState.close()}>
              <Link sx={{ display: "flex" }} noLinkStyle href={href}>
                <ListItemIcon>
                  <FontAwesomeIcon icon={icon} />
                </ListItemIcon>
                <ListItemText primary={title} />
              </Link>
            </MenuItem>
          );
        }

        return (
          <MenuItem
            // eslint-disable-next-line react/no-array-index-key
            key={index}
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
            onClick={onClick ?? popupState.close}
          >
            <ListItemIcon>
              <FontAwesomeIcon icon={icon} />
            </ListItemIcon>
            <ListItemText primary={title} />
          </MenuItem>
        );
      })}
    </Menu>
  );
};
