import { useMemo, useState, VFC } from "react";
import {
  faLink,
  faAdd,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import pluralize from "pluralize";
import { ListItemIcon, ListItemText, Menu } from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/core";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { MenuItem } from "../../../ui";

type EntityTypeMenuProps = {
  popupState: PopupState;
  accountId: string;
  entityId: string;
  entityTitle: string;
};

type MenuItemType = {
  title: string;
  icon: IconDefinition;
  faded?: boolean;
} & ({ href: string; onClick?: null } | { href?: string; onClick: () => void });

// @todo-mui get free icons that matches the design closely
export const EntityTypeMenu: VFC<EntityTypeMenuProps> = ({
  popupState,
  accountId,
  entityId,
  entityTitle,
}) => {
  const [copied, setCopied] = useState(false);

  // Commented out menu items whose functionality have not been
  // implemented yet
  // @todo uncomment when functionality has been implemented
  const menuItems: MenuItemType[] = useMemo(() => {
    return [
      // {
      //   title: "Add to Bookmarks",
      //   icon: faBookmark,
      // },
      {
        title: `Create new ${pluralize.singular(entityTitle)}`,
        icon: faAdd,
        href: `/${accountId}/entities/new?entityTypeId=${entityId}`,
        faded: false,
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
      // {
      //   title: "Create filtered page",
      //   icon: faFilter,
      // },
      // {
      //   title: "Delete type",
      //   icon: faTrash,
      //   faded: true,
      // },
    ];
  }, [accountId, entityId, entityTitle, copied, popupState]);

  return (
    <Menu {...bindMenu(popupState)}>
      {menuItems.map(({ title, icon, onClick, href, faded }, index) => {
        if (href) {
          return (
            <MenuItem
              href={href}
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              onClick={() => popupState.close()}
            >
              <ListItemIcon>
                <FontAwesomeIcon icon={icon} />
              </ListItemIcon>
              <ListItemText primary={title} />
            </MenuItem>
          );
        }

        return (
          <MenuItem
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            faded={faded}
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
