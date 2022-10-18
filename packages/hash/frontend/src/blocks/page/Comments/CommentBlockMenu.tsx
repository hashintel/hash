import { FunctionComponent } from "react";
import { ListItemIcon, ListItemText } from "@mui/material";
import { bindMenu, PopupState } from "material-ui-popup-state/hooks";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { Menu, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { MenuItem } from "../../../shared/ui";

interface MenuItem {
  title: string;
  icon: IconDefinition;
  onClick: () => void;
}

type CommentBlockMenuProps = {
  menuItems: MenuItem[];
  popupState: PopupState;
  onEditableChange: () => void;
};

export const CommentBlockMenu: FunctionComponent<CommentBlockMenuProps> = ({
  menuItems,
  popupState,
}) => {
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
