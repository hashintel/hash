import { Box, ListItemText, Menu } from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import type { MinimalOrg } from "../../../../../lib/user-and-org";
import { MenuItem } from "../../../../../shared/ui/menu-item";
import { ContextButton, contextMenuProps } from "../../../shared/context-menu";

export const OrgContextMenu = ({
  leaveOrg,
  org,
}: {
  leaveOrg: () => void;
  org: MinimalOrg;
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "actions-dropdown-menu",
  });

  return (
    <Box>
      <ContextButton {...bindTrigger(popupState)}>...</ContextButton>

      <Menu {...bindMenu(popupState)} {...contextMenuProps}>
        <MenuItem href={`/@${org.shortname}`}>
          <ListItemText primary="View profile" />
        </MenuItem>
        <MenuItem href={`/settings/organizations/${org.shortname}/general`}>
          <ListItemText primary="Edit profile" />
        </MenuItem>
        <MenuItem href={`/settings/organizations/${org.shortname}/members`}>
          <ListItemText primary="View members" />
        </MenuItem>
        <MenuItem
          href={`/settings/organizations/${org.shortname}/members#invite`}
        >
          <ListItemText primary="Invite new members" />
        </MenuItem>
        <MenuItem
          dangerous
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
