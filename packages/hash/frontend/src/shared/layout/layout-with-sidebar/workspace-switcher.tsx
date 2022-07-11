import { VFC, useRef, useMemo } from "react";
import {
  Box,
  Typography,
  Menu,
  Divider,
  ListItemText,
  ListItemAvatar,
  Tooltip,
} from "@mui/material";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import {
  usePopupState,
  bindTrigger,
  bindMenu,
} from "material-ui-popup-state/hooks";
import { Avatar, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { useUser } from "../../../components/hooks/useUser";
import { useLogout } from "../../../components/hooks/useLogout";
import { Button, MenuItem } from "../../ui";
import { useRouteAccountInfo } from "../../routing";

type WorkspaceSwitcherProps = {};

export const WorkspaceSwitcher: VFC<WorkspaceSwitcherProps> = () => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupState = usePopupState({
    variant: "popover",
    popupId: "workspace-switcher-menu",
  });
  const { user } = useUser();
  const { logout } = useLogout();
  const { accountId } = useRouteAccountInfo();

  const activeWorkspace = useMemo(() => {
    let accountName = "";

    if (user && accountId === user.accountId) {
      accountName = user.properties.preferredName || user.properties.shortname!;
    } else {
      const activeOrg = user?.memberOf.find(
        ({ org }) => org.accountId === accountId,
      )?.org;

      if (activeOrg) {
        accountName = activeOrg.properties.name;
      }
    }

    return { name: accountName || "User", accountId };
  }, [accountId, user]);

  const workspaceList = useMemo(() => {
    if (!user) {
      return [];
    }

    return [
      {
        key: user.accountId,
        url: `/${user.accountId}`,
        title: "My personal workspace",
        subText: `@${user.properties.shortname ?? "user"}`,
        avatarTitle: user.properties.preferredName ?? "U",
      },
      ...user.memberOf.map(({ org }) => ({
        key: org.accountId,
        url: `/${org.accountId}`,
        title: org.properties.name,
        subText: `${org.memberships.length} members`,
        avatarTitle: org.properties.name,
      })),
    ];
  }, [user]);

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
              <Avatar size={34} title={user?.properties.preferredName ?? "U"} />
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
