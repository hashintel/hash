import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { Avatar, FontAwesomeIcon } from "@hashintel/design-system";
import type { OwnedById } from "@local/hash-subgraph";
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
import { useMemo } from "react";

import { useLogoutFlow } from "../../../components/hooks/use-logout-flow";
import { useAuthenticatedUser } from "../../../pages/shared/auth-info-context";
import { getImageUrlFromEntityProperties } from "../../../pages/shared/get-image-url-from-properties";
import { useActiveWorkspace } from "../../../pages/shared/workspace-context";
import { Button, MenuItem } from "../../ui";

export const WorkspaceSwitcher = () => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "workspace-switcher-menu",
  });
  const { authenticatedUser } = useAuthenticatedUser();
  const { logout } = useLogoutFlow();
  const { activeWorkspaceOwnedById, updateActiveWorkspaceOwnedById } =
    useActiveWorkspace();

  const activeWorkspace = useMemo<{ name: string; avatarSrc?: string }>(() => {
    if (activeWorkspaceOwnedById === authenticatedUser.accountId) {
      return {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- @todo how to handle empty displayName
        name: authenticatedUser.displayName || authenticatedUser.shortname!,
        avatarSrc: authenticatedUser.hasAvatar
          ? getImageUrlFromEntityProperties(
              authenticatedUser.hasAvatar.imageEntity.properties,
            )
          : undefined,
      };
    } else {
      const { org: activeOrg } =
        authenticatedUser.memberOf.find(
          ({ org: { accountGroupId } }) =>
            accountGroupId === activeWorkspaceOwnedById,
        ) ?? {};

      if (activeOrg) {
        return {
          name: activeOrg.name,
          avatarSrc: activeOrg.hasAvatar
            ? getImageUrlFromEntityProperties(
                activeOrg.hasAvatar.imageEntity.properties,
              )
            : undefined,
        };
      }
    }

    return { name: "User" };
  }, [activeWorkspaceOwnedById, authenticatedUser]);

  const workspaceList = useMemo(() => {
    return [
      {
        ownedById: authenticatedUser.accountId as OwnedById,
        title: "My personal workspace",
        subText: `@${authenticatedUser.shortname ?? "user"}`,
        avatarTitle: authenticatedUser.displayName ?? "U",
        avatarSrc: authenticatedUser.hasAvatar
          ? getImageUrlFromEntityProperties(
              authenticatedUser.hasAvatar.imageEntity.properties,
            )
          : undefined,
      },
      ...authenticatedUser.memberOf.map(
        ({ org: { accountGroupId, name, memberships, hasAvatar } }) => ({
          ownedById: accountGroupId as OwnedById,
          title: name,
          subText: memberships.length ? `${memberships.length} members` : "", // memberships are loaded in the background
          avatarTitle: name,
          avatarSrc: hasAvatar
            ? getImageUrlFromEntityProperties(hasAvatar.imageEntity.properties)
            : undefined,
        }),
      ),
    ];
  }, [authenticatedUser]);

  return (
    <Box>
      <Tooltip placement="bottom" title={activeWorkspace.name}>
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
          <Avatar
            size={22}
            src={activeWorkspace.avatarSrc}
            title={activeWorkspace.name}
          />
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
            {activeWorkspace.name}
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
        {workspaceList.map(({ title, subText, ownedById, avatarSrc }) => (
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
                src={avatarSrc}
                size={34}
                title={
                  ownedById === authenticatedUser.accountId
                    ? authenticatedUser.displayName
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
