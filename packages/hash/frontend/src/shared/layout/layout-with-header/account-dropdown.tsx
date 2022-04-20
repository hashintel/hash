import { useMemo, VoidFunctionComponent } from "react";
import {
  Box,
  Typography,
  Divider,
  Tooltip,
  Menu,
  MenuItem,
  ListItemText,
} from "@mui/material";

import {
  usePopupState,
  bindMenu,
  bindTrigger,
} from "material-ui-popup-state/hooks";
import { UserFieldsFragment } from "../../../graphql/apiTypes.gen";
import { Avatar } from "../../ui";
import { HeaderIconButton } from "./shared/header-icon-button";

type AccountDropdownProps = {
  avatar?: string;
  logout: () => void;
  user: UserFieldsFragment;
};

export const AccountDropdown: VoidFunctionComponent<AccountDropdownProps> = ({
  avatar,
  logout,
  user,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "account-dropdown-menu",
  });

  const userPrimaryEmail = useMemo(() => {
    const primaryEmail = user.properties.emails.find((email) => email.primary);

    return primaryEmail?.address;
  }, [user]);

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
              <strong>{user.properties.preferredName}</strong>
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
            <Avatar size={32} title={user?.properties.preferredName ?? "U"} />
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
            {user.properties.preferredName}
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
        <MenuItem onClick={popupState.close}>
          <ListItemText primary="Account Settings" />
        </MenuItem>
        <MenuItem onClick={popupState.close}>
          <ListItemText primary="Appearance" />
        </MenuItem>
        <Divider />
        <MenuItem onClick={logout}>
          <ListItemText
            primary="Sign Out"
            primaryTypographyProps={{
              // @todo MenuItem should have a prop faded that handles this
              // remove the need for important
              sx: ({ palette }) => ({
                color: `${palette.gray[60]} !important`,
              }),
            }}
          />
        </MenuItem>
      </Menu>
    </Box>
  );
};
