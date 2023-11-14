import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  AsteriskRegularIcon,
  FontAwesomeIcon,
  LinkIcon,
} from "@hashintel/design-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import {
  Box,
  Divider,
  ListItemIcon,
  listItemSecondaryActionClasses,
  ListItemText,
  Menu,
  Typography,
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
import { HashtagRegularIcon } from "../../icons/hashtag-regular-icon";
import { UploadRegularIcon } from "../../icons/upload-regular-icon";
import { MenuItem } from "../../ui";
import { CreatePageMenuItems } from "./actions-dropdown/create-page-menu-items";
import { HeaderIconButton } from "./shared/header-icon-button";

const ActionsDropdownInner: FunctionComponent = () => {
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
        <Typography
          sx={{
            marginTop: 1,
            marginX: 1.5,
            color: ({ palette }) => palette.gray[50],
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          Create New
        </Typography>
        {hashInstance?.properties.pagesAreEnabled ? (
          <CreatePageMenuItems onClick={popupState.close} />
        ) : null}
        <MenuItem href="/new/entity" onClick={popupState.close}>
          <ListItemIcon>
            <HashtagRegularIcon />
          </ListItemIcon>
          <ListItemText primary="Entity" />
        </MenuItem>
        <MenuItem href="/new/types/entity-type" onClick={popupState.close}>
          <ListItemIcon>
            <AsteriskRegularIcon />
          </ListItemIcon>
          <ListItemText primary="Entity type" />
        </MenuItem>
        <MenuItem
          href={`/new/types/entity-type?extends=${linkEntityTypeUrl}`}
          onClick={popupState.close}
        >
          <ListItemIcon>
            <LinkIcon />
          </ListItemIcon>
          <ListItemText primary="Link type" />
        </MenuItem>
        <Divider />
        <MenuItem
          href={`${systemEntityTypes.file.entityTypeId}?tab=upload`}
          onClick={popupState.close}
        >
          <ListItemIcon>
            <UploadRegularIcon />
          </ListItemIcon>
          <ListItemText primary="Upload a file" />
        </MenuItem>
      </Menu>
    </Box>
  );
};

export const ActionsDropdown: FunctionComponent = () => {
  const { activeWorkspaceOwnedById } = useContext(WorkspaceContext);

  return activeWorkspaceOwnedById ? <ActionsDropdownInner /> : null;
};
