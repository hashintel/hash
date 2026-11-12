import { Box, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { MenuItem } from "../../../../shared/ui";
import { ContextButton } from "../../shared/context-menu";
import { contextMenuProps } from "../../shared/context-menu-props";

export const UserIntegrationContextMenu = ({
  integrationSlug,
}: {
  integrationSlug: string;
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "actions-dropdown-menu",
  });

  return (
    <Box>
      <ContextButton {...bindTrigger(popupState)}>...</ContextButton>

      <Menu {...bindMenu(popupState)} {...contextMenuProps}>
        <MenuItem href={`/settings/integrations/${integrationSlug}`}>
          <ListItemText primary="Edit integration" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
