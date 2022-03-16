import React from "react";
// import { useModal } from "react-modal-hook";
import { Box, Button, useTheme, useMediaQuery } from "@mui/material";
import { useRouter } from "next/router";

import { useLogout } from "../../hooks/useLogout";
import { useUser } from "../../hooks/useUser";
// import { LoginModal } from "../../Modals/AuthModal/LoginModal";
import { AccountDropdown } from "./AccountDropdown";
import { SearchBar } from "./SearchBar";
import { HashNavIcon } from "../../icons";
import { Link } from "../../Link";
import { ActionsDropdown } from "./ActionsDropdown";
import { NotificationsDropdown } from "./NotificationsDropdown";

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
  const router = useRouter();

  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const {
    user,
    // refetch
  } = useUser();
  const { logout } = useLogout();

  // const [showLoginModal, hideLoginModal] = useModal(() => (
  //   <LoginModal
  //     show
  //     onClose={hideLoginModal}
  //     onLoggedIn={() => {
  //       void refetch();
  //       hideLoginModal();
  //     }}
  //   />
  // ));

  return (
    <Box
      component="header"
      sx={{
        background: theme.palette.common.white,
        borderBottom: `1px solid ${theme.palette.gray["30"]}`,
        display: "flex",
        alignItems: "center",
        height: HEADER_HEIGHT,
      }}
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
                sx={{
                  height: theme.spacing(2.25),
                  width: "auto",
                  fill: theme.palette.gray["50"],
                }}
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
              // navigating to the login route instead of showing the login modal for now
              // since there's some z-index issues between the sidebar and the modal
              onClick={() => router.push("/login")}
            >
              Sign In
            </Button>

            <Button size="small" onClick={() => router.push("/signup")}>
              Sign Up
            </Button>
          </Box>
        )}
      </Nav>
    </Box>
  );
};
