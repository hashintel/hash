import { Box, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

import { useHashInstance } from "../../../components/hooks/use-hash-instance";
import { useLogoutFlow } from "../../../components/hooks/use-logout-flow";
import { useAuthInfo } from "../../../pages/shared/auth-info-context";
import { useDraftEntities } from "../../draft-entities-context";
import { CheckRegularIcon } from "../../icons/check-regular-icon";
import { HashLockup } from "../../icons/hash-lockup";
import { Button, Link } from "../../ui";
import { AccountDropdown } from "./account-dropdown";
import { ActionsDropdown } from "./actions-dropdown";
import { NotificationsDropdown } from "./notifications-dropdown";
import { SearchBar } from "./search-bar";
import { HeaderIconButtonWithCount } from "./shared/header-icon-button-with-count";

const Nav: FunctionComponent<{ children?: ReactNode }> = ({ children }) => (
  <Box
    component="nav"
    sx={{
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      px: { xs: 2, md: 2.5 },
    }}
  >
    {children}
  </Box>
);

export const HEADER_HEIGHT = 60;

export const PageHeader: FunctionComponent = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const { authenticatedUser } = useAuthInfo();
  const { hashInstance } = useHashInstance();
  const { logout } = useLogoutFlow();
  const { draftEntities } = useDraftEntities();

  return (
    <Box
      component="header"
      sx={({ palette }) => ({
        background: palette.common.white,
        borderBottom: `1px solid ${palette.gray["30"]}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: HEADER_HEIGHT,
      })}
    >
      <Nav>
        <Box
          sx={{
            display: "flex",
            justifyContent: {
              xs: "space-between",
              md: "unset",
            },
            width: isMobile && authenticatedUser ? "100%" : undefined,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Link noLinkStyle href="/">
              <HashLockup
                sx={{
                  height: "1.1rem",
                  marginBottom: "-4px",
                  width: "auto",
                }}
              />
            </Link>
          </Box>
          {authenticatedUser ? <SearchBar /> : null}
        </Box>
        {authenticatedUser ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              columnGap: {
                xs: 1,
                md: 1.5,
              },
            }}
          >
            <ActionsDropdown />
            <NotificationsDropdown />
            <Tooltip title="Actions" placement="bottom">
              <Link noLinkStyle href="/actions">
                <HeaderIconButtonWithCount
                  icon={
                    <CheckRegularIcon sx={{ color: theme.palette.blue[70] }} />
                  }
                  count={draftEntities?.length}
                />
              </Link>
            </Tooltip>
            <AccountDropdown
              logout={logout}
              authenticatedUser={authenticatedUser}
            />
          </Box>
        ) : (
          <Box>
            <Button
              variant="tertiary_quiet"
              sx={{ mr: 1 }}
              size="xs"
              // navigating to the sign in route instead of showing the sign in modal for now
              // since there's some z-index issues between the sidebar and the modal
              href="/signin"
            >
              Sign In
            </Button>
            {hashInstance?.properties.userSelfRegistrationIsEnabled ? (
              <Button href="/signup" size={isMobile ? "xs" : "small"}>
                Sign Up
              </Button>
            ) : null}
          </Box>
        )}
      </Nav>
    </Box>
  );
};
