import { Avatar } from "@hashintel/design-system";
import {
  Box,
  Divider,
  ListItemText,
  Menu,
  Tooltip,
  Typography,
  typographyClasses,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import type { FunctionComponent } from "react";
import { useMemo } from "react";

import { useAuthenticatedUser } from "../../../pages/shared/auth-info-context";
import { getImageUrlFromEntityProperties } from "../../../pages/shared/get-file-properties";
import { Link, MenuItem } from "../../ui";
import { HeaderIconButton } from "./shared/header-icon-button";

type AccountDropdownProps = {
  logout: () => void;
};

export const AccountDropdown: FunctionComponent<AccountDropdownProps> = ({
  logout,
}) => {
  const { authenticatedUser, isInstanceAdmin } = useAuthenticatedUser();

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
              <strong>{authenticatedUser.displayName}</strong>
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
          <Avatar
            size={32}
            title={
              authenticatedUser.displayName ?? userPrimaryEmail?.[0] ?? "?"
            }
            src={
              authenticatedUser.hasAvatar
                ? getImageUrlFromEntityProperties(
                    authenticatedUser.hasAvatar.imageEntity.properties,
                  )
                : undefined
            }
          />
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
        <Link
          href={`/@${authenticatedUser.shortname}`}
          noLinkStyle
          sx={{
            [`&:hover .${typographyClasses.root}`]: {
              color: ({ palette }) => palette.blue[70],
            },
          }}
          onClick={() => popupState.close()}
        >
          <Box px={1.5} pt={1} pb={0.25} display="flex" flexDirection="column">
            <Typography
              variant="smallTextLabels"
              sx={({ palette }) => ({
                color: palette.gray[80],
                fontWeight: 500,
              })}
            >
              {authenticatedUser.displayName}
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
        </Link>
        <Divider />
        {authenticatedUser.accountSignupComplete && [
          <MenuItem
            href="/settings"
            key="settings"
            onClick={() => popupState.close()}
          >
            <ListItemText primary="Settings" />
          </MenuItem>,
          <MenuItem
            href="/settings/organizations"
            key="organizations"
            onClick={() => popupState.close()}
          >
            <ListItemText primary="Organizations" />
          </MenuItem>,
          <MenuItem
            href="/settings/integrations"
            key="integrations"
            onClick={() => popupState.close()}
          >
            <ListItemText primary="Integrations" />
          </MenuItem>,
          <Divider key="divider-admin" />,
          isInstanceAdmin ? (
            <MenuItem
              href="/admin"
              key="admin"
              onClick={() => popupState.close()}
            >
              <ListItemText primary="Instance Admin" />
            </MenuItem>
          ) : null,
          <Divider key="divider" />,
        ]}

        <MenuItem onClick={logout} faded>
          <ListItemText primary="Sign Out" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
