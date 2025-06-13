import { Box, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { MenuItem } from "../../../../shared/ui";
import { ContextButton, contextMenuProps } from "../../shared/context-menu";

export const UserIntegrationContextMenu = ({
  integrationType,
}: {
  integrationType: "linear";
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "actions-dropdown-menu",
  });

  return (
    <Box>
      <ContextButton {...bindTrigger(popupState)}>...</ContextButton>

      <Menu {...bindMenu(popupState)} {...contextMenuProps}>
        <MenuItem href={`/settings/integrations/${integrationType}`}>
          <ListItemText primary="Edit integration" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
