import { VFC, useRef, useMemo } from "react";
import {
  Box,
  Typography,
  Menu,
  MenuItem,
  Divider,
  ListItemText,
  ListItemAvatar,
  listItemTextClasses,
} from "@mui/material";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import {
  usePopupState,
  bindTrigger,
  bindMenu,
} from "material-ui-popup-state/hooks";
import { useUser } from "../../hooks/useUser";
import { useLogout } from "../../hooks/useLogout";
import { useCurrentWorkspaceContext } from "../../../contexts/CurrentWorkspaceContext";
import { Avatar, Button, Link } from "../../../shared/ui";
import { FontAwesomeIcon } from "../../../shared/icons";

type WorkspaceSwitcherProps = {};

export const WorkspaceSwitcher: VFC<WorkspaceSwitcherProps> = () => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupState = usePopupState({
    variant: "popover",
    popupId: "workspace-switcher-menu",
  });
  const { user } = useUser();
  const { logout } = useLogout();
  const { accountId: activeAccountId } = useCurrentWorkspaceContext();

  const activeWorkspace = useMemo(() => {
    let accountName = "";

    if (user && activeAccountId === user.accountId) {
      accountName = user.properties.preferredName || user.properties.shortname!;
    } else {
      const activeOrg = user?.memberOf.find(
        ({ org }) => org.accountId === activeAccountId,
      )?.org;

      if (activeOrg) {
        accountName = activeOrg.properties.name;
      }
    }

    return { name: accountName || "User", accountId: activeAccountId };
  }, [activeAccountId, user]);

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
      <Button
        ref={buttonRef}
        variant="tertiary_quiet"
        fullWidth
        sx={({ spacing }) => ({
          backgroundColor: "transparent",
          padding: spacing(1.5, 2, 1.5, 2.25),
          justifyContent: "flex-start",
          textAlign: "left",
        })}
        {...bindTrigger(popupState)}
      >
        <Avatar size={24} title={activeWorkspace.name} />
        <Typography
          sx={{
            pr: 1,
            pl: 1,
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

      <Menu
        {...bindMenu(popupState)}
        MenuListProps={{
          sx: {
            paddingTop: "10px",
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
          >
            <Link
              href={url}
              noLinkStyle
              sx={{
                display: "flex",
              }}
            >
              <ListItemAvatar>
                <Avatar
                  size={34}
                  title={user?.properties.preferredName ?? "U"}
                />
              </ListItemAvatar>

              <ListItemText
                primary={title}
                secondary={subText}
                primaryTypographyProps={{ fontWeight: 600 }}
              />
            </Link>
          </MenuItem>
        ))}

        <Divider />

        {[
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
          <MenuItem key={index} onClick={() => popupState.close()}>
            <Link href={href} noLinkStyle>
              <ListItemText primary={title} />
            </Link>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          sx={{
            [`& .${listItemTextClasses.primary}`]: {
              color: ({ palette }) => palette.gray[60],
            },
          }}
          onClick={() => logout()}
        >
          <ListItemText primary="Sign out" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
