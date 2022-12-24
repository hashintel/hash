import { Avatar } from "@hashintel/hash-design-system";
import {
  Box,
  Divider,
  ListItemText,
  Menu,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { FunctionComponent, useMemo } from "react";

import { AuthenticatedUser } from "../../../lib/user-and-org";
import { MenuItem } from "../../ui";
import { HeaderIconButton } from "./shared/header-icon-button";

type AccountDropdownProps = {
  avatar?: string;
  logout: () => void;
  authenticatedUser: AuthenticatedUser;
};

export const AccountDropdown: FunctionComponent<AccountDropdownProps> = ({
  avatar,
  logout,
  authenticatedUser,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "account-dropdown-menu",
  });

  const userPrimaryEmail = useMemo(() => {
    const primaryEmail = authenticatedUser.emails.find(
      (email) => email.primary,
    );

    return primaryEmail?.address;
  }, [authenticatedUser]);

  return (
    <Box>
      <Tooltip
        componentsProps={{ tooltip: { sx: { p: 1.5 } } }}
        title={
          <>
            <Typography
              variant="smallTextLabels"
              sx={{
                fontWeight: 500,
              }}
              mb={0.5}
            >
              <strong>{authenticatedUser.preferredName}</strong>
            </Typography>
            {userPrimaryEmail && (
              <Typography
                component="p"
                variant="microText"
                sx={({ palette }) => ({ color: palette.common.white })}
              >
                {userPrimaryEmail}
              </Typography>
            )}
          </>
        }
        placement="bottom"
      >
        <HeaderIconButton
          {...bindTrigger(popupState)}
          rounded
          sx={{
            height: 32,
            width: 32,
            padding: 0,
          }}
          data-testid="user-avatar"
        >
          {avatar ? (
            <Box
              component="img"
              alt="avatar"
              src={avatar}
              sx={{ height: "32px", width: "32px", borderRadius: "100%" }}
            />
          ) : (
            <Avatar size={32} title={authenticatedUser.preferredName ?? "U"} />
          )}
        </HeaderIconButton>
      </Tooltip>

      {/* @todo override dense prop for menu item  */}
      {/* the menu items here should have a dense prop */}
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
          sx: ({ palette }) => ({
            width: 225,
            marginTop: 1,
            border: `1px solid ${palette.gray["20"]}`,
          }),
        }}
      >
        <Box px={1.5} pt={1} pb={0.25} display="flex" flexDirection="column">
          <Typography
            variant="smallTextLabels"
            sx={({ palette }) => ({
              color: palette.gray[80],
              fontWeight: 500,
            })}
          >
            {authenticatedUser.preferredName}
          </Typography>
          {userPrimaryEmail && (
            <Typography
              variant="microText"
              sx={({ palette }) => ({ color: palette.gray[70] })}
            >
              {userPrimaryEmail}
            </Typography>
          )}
        </Box>
        <Divider />
        {/*  
          Commented out menu items whose functionality have not been implemented yet
          @todo uncomment when functionality has been implemented 
        */}
        {/* <MenuItem onClick={popupState.close}>
          <ListItemText primary="Account Settings" />
        </MenuItem>
        <MenuItem onClick={popupState.close}>
          <ListItemText primary="Appearance" />
        </MenuItem>
        <Divider /> */}
        <MenuItem onClick={logout} faded>
          <ListItemText primary="Sign Out" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
