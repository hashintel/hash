import { FunctionComponent, useMemo } from "react";
import { ListItemIcon, ListItemText } from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import { faLink, faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Menu, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { MenuItem } from "../../../shared/ui";

type CommentBlockMenuProps = {
  popupState: PopupState;
};

export const CommentBlockMenu: FunctionComponent<CommentBlockMenuProps> = ({
  popupState,
}) => {
  const menuItems = useMemo(
    () => [
      {
        title: "Edit",
        icon: faPencil,
        // @todo Commented implement functionality
        onClick: async () => {},
      },
      {
        title: "Copy Link",
        icon: faLink,
        // @todo Commented implement functionality
        onClick: async () => {},
      },
      {
        title: "Delete Comment",
        icon: faTrash,
        // @todo Commented implement functionality
        onClick: async () => {},
      },
    ],
    [],
  );

  const bindMenuProps = bindMenu(popupState);

  return (
    <Menu
      {...bindMenuProps}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
    >
      {menuItems.map(({ title, icon, onClick }) => {
        return (
          <MenuItem key={title} onClick={onClick ?? popupState.close}>
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
