import { Box, useMediaQuery, useTheme } from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

import { useHashInstance } from "../../../components/hooks/use-hash-instance";
import { useLogoutFlow } from "../../../components/hooks/use-logout-flow";
import { useAuthInfo } from "../../../pages/shared/auth-info-context";
import { HashAlphaNavIcon } from "../../icons";
import { Button, Link } from "../../ui";
import { AccountDropdown } from "./account-dropdown";
import { ActionsDropdown } from "./actions-dropdown";
import { SearchBar } from "./search-bar";

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

export const HEADER_HEIGHT = 54;

export const PageHeader: FunctionComponent = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const { authenticatedUser } = useAuthInfo();
  const { hashInstance } = useHashInstance();
  const { logout } = useLogoutFlow();

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
              <HashAlphaNavIcon
                sx={({ palette }) => ({
                  height: "1.1rem",
                  marginBottom: "-4px",
                  width: "auto",
                  fill: palette.gray["50"],
                })}
              />
            </Link>
          </Box>
          {authenticatedUser ? <SearchBar /> : null}
        </Box>
        {authenticatedUser ? (
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <ActionsDropdown />
            {/*  
              Commented out Notifications dropdown because the functionality has not been implemented yet
              @todo uncomment when functionality has been implemented 
            */}
            {/* <NotificationsDropdown /> */}
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
              // navigating to the login route instead of showing the login modal for now
              // since there's some z-index issues between the sidebar and the modal
              href="/login"
            >
              Sign In
            </Button>
            {hashInstance && hashInstance.userSelfRegistrationIsEnabled ? (
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
