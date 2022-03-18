import { VFC, useRef, useMemo } from "react";
import { Box, Typography, Menu, MenuItem, Divider } from "@mui/material";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/router";
import {
  usePopupState,
  bindTrigger,
  bindMenu,
} from "material-ui-popup-state/hooks";
import { FontAwesomeIcon } from "../../icons";
import { Link } from "../../Link";
import { useUser } from "../../hooks/useUser";
import { Avatar } from "../../Avatar";
import { Button } from "../../Button";
import { useLogout } from "../../hooks/useLogout";

type WorkspaceSwitcherProps = {};

const truncateText = (text: string) => {
  if (text.length > 18) {
    return `${text.slice(0, 15)}...`;
  }
  return text;
};

export const WorkspaceSwitcher: VFC<WorkspaceSwitcherProps> = () => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupState = usePopupState({
    variant: "popover",
    popupId: "workspace-switcher-menu",
  });
  const { user } = useUser();
  const { logout } = useLogout();
  const { query } = useRouter();

  const activeWorkspace = useMemo(() => {
    const activeAccountId = query.accountId as string;
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

    return { name: accountName || "User" };
  }, [query, user]);

  return (
    <Box>
      {/* @todo-mui use the Button component for this instead  */}
      <Button
        ref={buttonRef}
        variant="tertiary_quiet"
        fullWidth
        sx={{
          backgroundColor: "transparent",
          padding: "12px 16px 12px 18px",
          justifyContent: "flex-start",
          textAlign: "left",
        }}
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
            color: ({ palette }) => palette.gray[80],
            fontWeight: 600,
          }}
          variant="smallTextLabels"
        >
          {truncateText(activeWorkspace.name)}
        </Typography>
        <FontAwesomeIcon
          icon={faChevronDown}
          sx={{ fontSize: 12, color: ({ palette }) => palette.gray[70] }}
        />
      </Button>
      <Menu {...bindMenu(popupState)}>
        <MenuItem>
          <Link
            href="/"
            noLinkStyle
            sx={{
              display: "flex",
            }}
          >
            <Avatar
              size={38}
              title={user?.properties.preferredName ?? "U"}
              sx={{
                mr: 0.75,
              }}
            />

            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Typography
                variant="smallTextLabels"
                sx={{
                  fontWeight: 600,
                  color: ({ palette }) => palette.gray[80],
                  mb: "2px",
                }}
              >
                My personal workspace
              </Typography>
              <Typography
                variant="microText"
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontWeight: 500,
                }}
              >{`@${user?.properties.shortname ?? "user"}`}</Typography>
            </Box>
          </Link>
        </MenuItem>

        {user?.memberOf.map(({ org }) => (
          <MenuItem key={org.accountId} onClick={popupState.close}>
            <Link
              href={`/${org.accountId}`}
              noLinkStyle
              key={org.accountId}
              sx={{
                display: "flex",
              }}
            >
              <Avatar
                size={38}
                sx={{
                  mr: 0.75,
                }}
                title={org.properties.name}
              />
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Typography
                  variant="smallTextLabels"
                  sx={{
                    fontWeight: 600,
                    color: ({ palette }) => palette.gray[80],
                    mb: "2px",
                  }}
                >
                  {org.properties.name}
                </Typography>
                <Typography
                  variant="microText"
                  sx={{
                    color: ({ palette }) => palette.gray[50],
                    fontWeight: 500,
                  }}
                >{`${org.memberships.length} members`}</Typography>
              </Box>
            </Link>
          </MenuItem>
        ))}

        <Divider />

        {[
          {
            title: "Workspace Settings",
            id: 1,
            href: "/",
          },
          {
            title: "Create or Join a workspace",
            id: 2,
            href: "/",
          },
        ].map(({ title, id, href }) => (
          <MenuItem key={id}>
            <Link key={id} href={href} noLinkStyle>
              <Typography
                variant="smallTextLabels"
                sx={{
                  lineHeight: 1,
                  color: ({ palette }) => palette.gray[80],
                  fontWeight: 500,
                }}
              >
                {title}
              </Typography>
            </Link>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => logout()}>
          <Typography
            variant="smallTextLabels"
            sx={{
              color: ({ palette }) => palette.gray[60],
            }}
          >
            Sign out
          </Typography>
        </MenuItem>
      </Menu>
    </Box>
  );
};
