import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { Avatar, FontAwesomeIcon } from "@hashintel/design-system";
import { OwnedById } from "@local/hash-subgraph";
import {
  Box,
  Divider,
  ListItemAvatar,
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
import { FunctionComponent, useContext, useMemo } from "react";

import { useLogoutFlow } from "../../../components/hooks/use-logout-flow";
import { useAuthenticatedUser } from "../../../pages/shared/auth-info-context";
import { WorkspaceContext } from "../../../pages/shared/workspace-context";
import { Button, MenuItem } from "../../ui";

type WorkspaceSwitcherProps = {};

export const WorkspaceSwitcher: FunctionComponent<
  WorkspaceSwitcherProps
> = () => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "workspace-switcher-menu",
  });
  const { authenticatedUser } = useAuthenticatedUser();
  const { logout } = useLogoutFlow();
  const { activeWorkspaceOwnedById, updateActiveWorkspaceOwnedById } =
    useContext(WorkspaceContext);

  const activeWorkspaceName = useMemo(() => {
    if (activeWorkspaceOwnedById === authenticatedUser.accountId) {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- @todo how to handle empty preferredName
      return authenticatedUser.preferredName || authenticatedUser.shortname!;
    } else {
      const activeOrg = authenticatedUser.memberOf.find(
        ({ accountGroupId }) => accountGroupId === activeWorkspaceOwnedById,
      );

      if (activeOrg) {
        return activeOrg.name;
      }
    }

    return "User";
  }, [activeWorkspaceOwnedById, authenticatedUser]);

  const workspaceList = useMemo(() => {
    return [
      {
        ownedById: authenticatedUser.accountId as OwnedById,
        title: "My personal workspace",
        subText: `@${authenticatedUser.shortname ?? "user"}`,
        avatarTitle: authenticatedUser.preferredName ?? "U",
      },
      ...authenticatedUser.memberOf.map(
        ({ accountGroupId, name, memberships }) => ({
          ownedById: accountGroupId as OwnedById,
          title: name,
          subText: `${memberships.length} members`,
          avatarTitle: name,
        }),
      ),
    ];
  }, [authenticatedUser]);

  return (
    <Box>
      <Tooltip placement="bottom" title={activeWorkspaceName}>
        <Button
          variant="tertiary_quiet"
          fullWidth
          sx={({ spacing }) => ({
            backgroundColor: "transparent",
            padding: spacing(1, 1.25),
            minHeight: 0,
            justifyContent: "flex-start",
            textAlign: "left",
          })}
          {...bindTrigger(popupState)}
        >
          <Avatar size={22} title={activeWorkspaceName} />
          <Typography
            sx={{
              pr: 1,
              pl: 1.25,
              overflowX: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              maxWidth: 140,
              color: ({ palette }) => palette.gray[80],
              fontWeight: 600,
            }}
            variant="smallTextLabels"
          >
            {activeWorkspaceName}
          </Typography>
          <FontAwesomeIcon
            icon={faChevronDown}
            sx={{ fontSize: 12, color: ({ palette }) => palette.gray[70] }}
          />
        </Button>
      </Tooltip>

      <Menu
        {...bindMenu(popupState)}
        MenuListProps={{
          sx: {
            paddingBottom: "6px",
          },
        }}
        autoFocus={false}
      >
        {workspaceList.map(({ title, subText, ownedById }) => (
          <MenuItem
            key={ownedById}
            selected={ownedById === activeWorkspaceOwnedById}
            onClick={() => {
              updateActiveWorkspaceOwnedById(ownedById);
              popupState.close();
            }}
          >
            <ListItemAvatar>
              <Avatar
                size={34}
                title={
                  ownedById === authenticatedUser.accountId
                    ? authenticatedUser.preferredName
                    : title
                }
              />
            </ListItemAvatar>
            <ListItemText
              primary={title}
              secondary={subText}
              primaryTypographyProps={{ fontWeight: 600 }}
            />
          </MenuItem>
        ))}

        <Divider />

        {[
          {
            title: "Settings",
            href: "/settings",
          },
          {
            title: "Create an organization",
            href: "/settings/organizations/new",
          },
        ].map(({ title, href }, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <MenuItem key={index} href={href} onClick={() => popupState.close()}>
            <ListItemText primary={title} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem faded onClick={() => logout()}>
          <ListItemText primary="Sign out" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
