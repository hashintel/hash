import { ArrowsRotateIconRegular } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import { useRouter } from "next/router";

import { Button } from "../../shared/ui/button";
import { Link } from "../../shared/ui/link";

const NewUserFallback = () => {
  return (
    <Box
      sx={{
        borderRadius: 2,
        boxShadow: ({ boxShadows }) => boxShadows.sm,
        py: 5,
        px: 9,
      }}
    >
      <Typography variant="h2" sx={{ fontSize: 26 }}>
        Thanks for signing up!
      </Typography>
      <Typography
        variant="regularTextParagraphs"
        sx={{ color: ({ palette }) => palette.gray[80], fontWeight: 700 }}
      >
        We’re currently upgrading HASH’s servers. You’ll be able to finish
        signing up when we’re done.
      </Typography>
      <Typography
        variant="regularTextParagraphs"
        sx={{
          color: ({ palette }) => palette.gray[80],
          fontWeight: 400,
          mt: 3,
          mb: 2,
        }}
      >
        Please try
        {/* eslint-disable-next-line no-script-url */}
        <Link href="javascript:location.reload();">reloading this page</Link>,
        or check back again later
      </Typography>

      {/* eslint-disable-next-line no-script-url */}
      <Button href="javascript:location.reload();" size="medium" sx={{ mt: 5 }}>
        Reload page
        <ArrowsRotateIconRegular
          sx={{ fill: ({ palette }) => palette.blue[70] }}
        />
      </Button>
    </Box>
  );
};

const DefaultFallback = () => {
  return (
    <Box
      sx={{
        borderRadius: 2,
        boxShadow: ({ boxShadows }) => boxShadows.sm,
        py: 5,
        px: 9,
      }}
    >
      <Typography variant="h2" sx={{ fontSize: 26 }}>
        HASH is temporarily unavailable as we make a number of key upgrades
      </Typography>
      <Typography
        variant="regularTextParagraphs"
        sx={{
          color: ({ palette }) => palette.gray[80],
          fontWeight: 400,
          mt: 3,
          mb: 2,
        }}
      >
        Please try
        {/* eslint-disable-next-line no-script-url */}
        <Link href="javascript:location.reload();">reloading this page</Link>,
        or check back again later
      </Typography>

      {/* eslint-disable-next-line no-script-url */}
      <Button href="javascript:location.reload();" size="medium" sx={{ mt: 5 }}>
        Reload page
        <ArrowsRotateIconRegular
          sx={{ fill: ({ palette }) => palette.blue[70] }}
        />
      </Button>
    </Box>
  );
};

export const MaintenanceFallback = () => {
  const router = useRouter();

  const { email } = router.query;

  if (email) {
    return <NewUserFallback />;
  }
};
