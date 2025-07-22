import {
  ArrowsRotateRegularIcon,
  // eslint-disable-next-line no-restricted-imports -- we don't want the in-project Button's link handling
  Button,
  UserPlusRegularIcon,
} from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";

import {
  getLayoutWithSidebar,
  type NextPageWithLayout,
} from "../shared/layout";
import { HEADER_HEIGHT } from "../shared/layout/layout-with-header/page-header";
import { Link } from "../shared/ui/link";

const ReloadButton = ({ color }: { color: "blue" | "white" }) => {
  return (
    <Button
      href={window.location.href}
      size="small"
      sx={{
        borderRadius: 2,
        mt: 5,
        boxShadow:
          color === "white" ? ({ boxShadows }) => boxShadows.md : undefined,
        fontWeight: 600,
      }}
      variant={color === "white" ? "tertiary_quiet" : "primary"}
    >
      Reload page
      <ArrowsRotateRegularIcon
        sx={{
          fill: ({ palette }) =>
            color === "white" ? palette.blue[70] : palette.blue[40],
          fontSize: 14,
          ml: 1.5,
        }}
      />
    </Button>
  );
};

const ReloadLink = () => (
  <Box
    component="a"
    href={window.location.href}
    sx={{
      fontWeight: 600,
      textDecoration: "none",
      color: ({ palette }) => palette.blue[70],
    }}
  >
    reloading this page
  </Box>
);

const NewUserFallback = () => {
  return (
    <Box>
      <Typography variant="h2" sx={{ fontSize: 26, fontWeight: 400 }}>
        Thanks for signing up!
      </Typography>
      <Typography
        component="p"
        variant="regularTextParagraphs"
        sx={{
          color: ({ palette }) => palette.gray[80],
          fontWeight: 700,
          mt: 3,
          mb: 2,
        }}
      >
        We’re currently upgrading HASH’s servers. You’ll be able to finish
        signing up when we’re done.
      </Typography>
      <Typography
        component="p"
        variant="regularTextParagraphs"
        sx={{
          color: ({ palette }) => palette.gray[80],
          fontWeight: 400,
        }}
      >
        {`Please try `}
        <ReloadLink />, or check back again later
      </Typography>

      <ReloadButton color="blue" />
    </Box>
  );
};

const DefaultFallback = () => {
  return (
    <Box>
      <Typography variant="h2" sx={{ fontSize: 26, fontWeight: 400 }}>
        HASH is temporarily unavailable
        <br /> as we make a number of key upgrades
      </Typography>
      <Typography
        component="p"
        variant="regularTextParagraphs"
        sx={{
          color: ({ palette }) => palette.gray[80],
          fontWeight: 400,
          mt: 3,
          mb: 2,
        }}
      >
        <strong>New users:</strong>
        {" you can still "}
        <Link
          href="https://hash.ai?signup"
          sx={{ fontWeight: 600, textDecoration: "none" }}
        >
          sign up for updates
        </Link>{" "}
        as we complete this upgrade
      </Typography>
      <Typography
        component="p"
        variant="regularTextParagraphs"
        sx={{
          color: ({ palette }) => palette.gray[80],
          fontWeight: 400,
        }}
      >
        <strong>Existing users:</strong>
        {` please try `}
        <ReloadLink />, or check back again later
      </Typography>

      <Stack direction="row" gap={1.5}>
        <Button
          href="https://hash.ai?signup"
          size="small"
          sx={{
            borderRadius: 2,
            mt: 5,
            fontWeight: 600,
          }}
        >
          Create an account
          <UserPlusRegularIcon
            sx={{
              ml: 1.5,
              fontSize: 18,
              fill: ({ palette }) => palette.blue[40],
            }}
          />
        </Button>
        <ReloadButton color="white" />
      </Stack>
    </Box>
  );
};

const MaintenancePage: NextPageWithLayout = () => {
  const isSignup =
    typeof window !== "undefined" && window.location.search.includes("email=");

  return (
    <Box
      sx={{
        background: "rgba(247, 250, 252, 0.3)",
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: "100vw",
      }}
    >
      <Box
        sx={({ palette }) => ({
          background: palette.gray[10],
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          width: "100%",
          top: HEADER_HEIGHT,
          position: "relative",
        })}
      >
        <Box
          sx={{
            background: "white",
            bottom: HEADER_HEIGHT,
            maxWidth: { xs: "90%", sm: 500, md: 780 },
            borderRadius: 2,
            boxShadow: ({ boxShadows }) => boxShadows.xs,
            position: "relative",
            py: { xs: 2.5, md: 5 },
            px: { xs: 3.5, md: 9 },
          }}
        >
          {isSignup ? <NewUserFallback /> : <DefaultFallback />}
        </Box>
      </Box>
    </Box>
  );
};

MaintenancePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default MaintenancePage;
