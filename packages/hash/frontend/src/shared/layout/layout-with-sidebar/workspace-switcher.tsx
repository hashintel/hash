import { FunctionComponent, useRef, useMemo } from "react";
import {
  Box,
  Typography,
  Divider,
  ListItemText,
  ListItemAvatar,
  Tooltip,
  Menu,
} from "@mui/material";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import {
  usePopupState,
  bindTrigger,
  bindMenu,
} from "material-ui-popup-state/hooks";
import { Avatar, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { useAuthenticatedUser } from "../../../components/hooks/useAuthenticatedUser";
import { Button, MenuItem } from "../../ui";
import { useRouteAccountInfo } from "../../routing";
import { useLogoutFlow } from "../../../components/hooks/useLogoutFlow";

type WorkspaceSwitcherProps = {};

export const WorkspaceSwitcher: FunctionComponent<
  WorkspaceSwitcherProps
> = () => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupState = usePopupState({
    variant: "popover",
    popupId: "workspace-switcher-menu",
  });
  const { authenticatedUser } = useAuthenticatedUser();
  const { logout } = useLogoutFlow();
  const { accountId } = useRouteAccountInfo();

  const activeWorkspace = useMemo(() => {
    let accountName = "";

    if (authenticatedUser && accountId === authenticatedUser.entityId) {
      accountName =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- @todo how to handle empty preferredName
        authenticatedUser.preferredName || authenticatedUser.shortname!;
    } else {
      const activeOrg = authenticatedUser?.memberOf.find(
        ({ entityId }) => entityId === accountId,
      );

      if (activeOrg) {
        accountName = activeOrg.name;
      }
    }

    return { name: accountName || "User", accountId };
  }, [accountId, authenticatedUser]);

  const workspaceList = useMemo(() => {
    if (!authenticatedUser) {
      return [];
    }

    return [
      {
        key: authenticatedUser.entityId,
        url: `/${authenticatedUser.entityId}`,
        title: "My personal workspace",
        subText: `@${authenticatedUser.shortname ?? "user"}`,
        avatarTitle: authenticatedUser.preferredName ?? "U",
      },
      ...authenticatedUser.memberOf.map(({ entityId, name, members }) => ({
        key: entityId,
        url: `/${entityId}`,
        title: name,
        subText: `${members.length} members`,
        avatarTitle: name,
      })),
    ];
  }, [authenticatedUser]);

  return (
    <Box>
      <Tooltip placement="bottom" title={activeWorkspace.name}>
        <Button
          ref={buttonRef}
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
          <Avatar size={22} title={activeWorkspace.name} />
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
        {workspaceList.map(({ title, subText, url, key }) => (
          <MenuItem
            key={key}
            selected={key === activeWorkspace.accountId}
            onClick={() => popupState.close()}
            href={url}
          >
            <ListItemAvatar>
              <Avatar
                size={34}
                title={authenticatedUser?.preferredName ?? "U"}
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

        {/*  
          Commented out menu items whose functionality have not been implemented yet
          @todo uncomment when functionality has been implemented 
        */}
        {/* {[
          {
            title: "Workspace Settings",
            href: "/",
          },
          {
            title: "Create or Join a workspace",
            href: "/",
          },
        ].map(({ title, href }, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <MenuItem key={index} href={href} onClick={() => popupState.close()}>
            <ListItemText primary={title} />
          </MenuItem>
        ))}
        <Divider /> */}
        <MenuItem faded onClick={() => logout()}>
          <ListItemText primary="Sign out" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
