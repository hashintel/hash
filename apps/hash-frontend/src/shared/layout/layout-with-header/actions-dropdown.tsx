import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { AccountId, linkEntityTypeUrl } from "@local/hash-subgraph";
import {
  Box,
  Divider,
  listItemSecondaryActionClasses,
  ListItemText,
  Menu,
  useTheme,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useContext } from "react";

import { useHashInstance } from "../../../components/hooks/use-hash-instance";
import { WorkspaceContext } from "../../../pages/shared/workspace-context";
import { MenuItem } from "../../ui";
import { CreatePageMenuItem } from "./actions-dropdown/create-page-menu-item";
import { HeaderIconButton } from "./shared/header-icon-button";

const ActionsDropdownInner: FunctionComponent<{
  activeWorkspaceAccountId: AccountId;
}> = ({ activeWorkspaceAccountId }) => {
  const theme = useTheme();

  const { hashInstance } = useHashInstance();

  const popupState = usePopupState({
    variant: "popover",
    popupId: "actions-dropdown-menu",
  });

  return (
    <Box>
      <HeaderIconButton
        size="medium"
        rounded
        sx={({ palette }) => ({
          mr: 1,
          color: popupState.isOpen ? palette.common.white : palette.gray[40],
          backgroundColor: popupState.isOpen
            ? palette.blue["70"]
            : palette.gray[20],
        })}
        {...bindTrigger(popupState)}
      >
        <FontAwesomeIcon icon={faPlus} />
      </HeaderIconButton>

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
        {hashInstance?.properties.pagesAreEnabled ? (
          <CreatePageMenuItem
            activeWorkspaceAccountId={activeWorkspaceAccountId}
            onClick={popupState.close}
          />
        ) : null}
        <Divider />
        <MenuItem href="/new/entity" onClick={popupState.close}>
          <ListItemText primary="Create entity" />
        </MenuItem>
        <Divider />
        <MenuItem href="/new/types/entity-type" onClick={popupState.close}>
          <ListItemText primary="Create entity type" />
        </MenuItem>
        <MenuItem
          href={`/new/types/entity-type?extends=${linkEntityTypeUrl}`}
          onClick={popupState.close}
        >
          <ListItemText primary="Create link type" />
        </MenuItem>
      </Menu>
    </Box>
  );
};

export const ActionsDropdown: FunctionComponent = () => {
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  return activeWorkspaceAccountId ? (
    <ActionsDropdownInner activeWorkspaceAccountId={activeWorkspaceAccountId} />
  ) : null;
};
