import { theme } from "@hashintel/design-system";
import {
  Box,
  listItemSecondaryActionClasses,
  ListItemText,
  Menu,
  styled,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { MenuItem } from "../../../../../../shared/ui/menu-item";

const ContextButton = styled("button")`
  background: none;
  border: none;
  border-radius: 8px;
  color: ${theme.palette.gray["60"]};
  font-size: 22px;
  cursor: pointer;
  padding: 0 12px 8px 12px;
  user-select: none;

  &:hover {
    background: ${theme.palette.gray["10"]};
  }
`;

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

      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          elevation: 4,
          sx: {
            borderRadius: "6px",
            marginTop: 1,
            border: `1px solid ${theme.palette.gray["20"]}`,

            [`.${listItemSecondaryActionClasses.root}`]: {
              display: { xs: "none", md: "block" },
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            removeFromOrg();
            popupState.close();
          }}
        >
          <ListItemText
            primary={self ? "Leave workspace" : "Remove from workspace"}
          />
        </MenuItem>
      </Menu>
    </Box>
  );
};
