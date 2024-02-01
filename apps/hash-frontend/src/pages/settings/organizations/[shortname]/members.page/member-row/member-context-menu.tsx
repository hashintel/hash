import { Box, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { MenuItem } from "../../../../../../shared/ui/menu-item";
import {
  ContextButton,
  contextMenuProps,
} from "../../../../shared/context-menu";

export const MemberContextMenu = ({
  removeFromOrg,
  self,
}: {
  removeFromOrg: () => void;
  self: boolean;
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "actions-dropdown-menu",
  });

  return (
    <Box>
      <ContextButton {...bindTrigger(popupState)}>...</ContextButton>

      <Menu {...bindMenu(popupState)} {...contextMenuProps}>
        <MenuItem
          dangerous
          onClick={() => {
            removeFromOrg();
            popupState.close();
          }}
        >
          <ListItemText
            primary={self ? "Leave organization" : "Remove from organization"}
          />
        </MenuItem>
      </Menu>
    </Box>
  );
};
