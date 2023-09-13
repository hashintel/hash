import { Box, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { MenuItem } from "../../../../../shared/ui/menu-item";
import { ContextButton, contextMenuProps } from "../../../shared/context-menu";

export const OrgContextMenu = ({ leaveOrg }: { leaveOrg: () => void }) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "actions-dropdown-menu",
  });

  return (
    <Box>
      <ContextButton {...bindTrigger(popupState)}>...</ContextButton>

      <Menu
        {...bindMenu(popupState)}
        {...contextMenuProps}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
      >
        <MenuItem
          onClick={() => {
            leaveOrg();
            popupState.close();
          }}
        >
          <ListItemText primary="Leave organization" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
