import { FunctionComponent, ReactNode } from "react";
import { Box, useTheme, useMediaQuery } from "@mui/material";

import { useLogoutFlow } from "../../../components/hooks/useLogoutFlow";
import { useAuthenticatedUser } from "../../../components/hooks/useAuthenticatedUser";
import { AccountDropdown } from "./account-dropdown";
import { SearchBar } from "./search-bar";
import { ActionsDropdown } from "./actions-dropdown";
import { Button, Link } from "../../ui";
import { HashAlphaNavIcon } from "../../icons";
import { useHashInstance } from "../../../components/hooks/useHashInstance";

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

  const { authenticatedUser } = useAuthenticatedUser();
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
            <Link
              noLinkStyle
              href={`/${
                authenticatedUser ? authenticatedUser.userAccountId : ""
              }`}
            >
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
            {hashInstance && !hashInstance.userRegistrationIsDisabled ? (
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
