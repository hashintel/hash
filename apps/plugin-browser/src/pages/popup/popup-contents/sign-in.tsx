import { Button } from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";

import { HashRainbowLockup } from "./sign-in/hash-rainbow-lockup";

export const SignIn = () => {
  return (
    <Box
      sx={{
        background: ({ palette }) => palette.gray[10],
        px: 6,
        py: 5.5,
        width: 440,
      }}
    >
      <Box mb={2}>
        <HashRainbowLockup sx={{ width: 120 }} />
      </Box>
      <Typography
        variant="smallTextParagraphs"
        sx={{ color: ({ palette }) => palette.gray[90] }}
      >
        You do not appear to be logged in to HASH in this browser session.
        Choose from the options below to get started.
      </Typography>
      <Box mt={3}>
        <Typography
          variant="smallCaps"
          sx={{ color: ({ palette }) => palette.gray[50], fontSize: 12 }}
        >
          Connect to HASH
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          sx={{ minWidth: "max-content", mt: 1.5 }}
        >
          <Button
            href={`${FRONTEND_ORIGIN}/signup`}
            size="small"
            target="_blank"
            variant="primary"
            sx={{ whiteSpace: "no-wrap" }}
          >
            Create a free account
          </Button>
          <Button
            href={`${FRONTEND_ORIGIN}/login`}
            size="small"
            target="_blank"
            variant="tertiary"
          >
            Sign in to an existing account
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};
