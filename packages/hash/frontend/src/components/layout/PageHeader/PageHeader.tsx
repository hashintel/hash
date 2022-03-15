import React from "react";
import { Box, useTheme, useMediaQuery } from "@mui/material";

import { useLogout } from "../../hooks/useLogout";
import { useUser } from "../../hooks/useUser";
import { AccountDropdown } from "./AccountDropdown";
import { SearchBar } from "./SearchBar";
import { HashNavIcon } from "../../icons";
import { Link } from "../../Link";
import { ActionsDropdown } from "./ActionsDropdown";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { Button } from "../../Button";

const Nav: React.FC = ({ children }) => (
  <Box
    component="nav"
    sx={{
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      px: { xs: 2, md: 3 },
    }}
  >
    {children}
  </Box>
);

export const HEADER_HEIGHT = 64;

export const PageHeader: React.VFC<{
  accountId: string;
}> = ({ accountId }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const { user } = useUser();
  const { logout } = useLogout();

  return (
    <Box
      component="header"
      sx={({ palette }) => ({
        background: palette.common.white,
        borderBottom: `1px solid ${palette.gray["30"]}`,
        display: "flex",
        alignItems: "center",
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
            width: isMobile && user ? "100%" : undefined,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Link noLinkStyle href={`/${user ? user.accountId : ""}`}>
              <HashNavIcon
                sx={({ palette }) => ({
                  height: "18px",
                  width: "auto",
                  fill: palette.gray["50"],
                })}
              />
            </Link>
          </Box>
          {user ? <SearchBar /> : null}
        </Box>
        {user ? (
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <ActionsDropdown accountId={accountId} />
            <NotificationsDropdown />
            <AccountDropdown logout={logout} user={user} />
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

            <Button href="/signup" size={isMobile ? "xs" : "small"}>
              Sign Up
            </Button>
          </Box>
        )}
      </Nav>
    </Box>
  );
};
