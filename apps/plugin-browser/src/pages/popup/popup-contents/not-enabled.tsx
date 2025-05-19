import { Button } from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";

import { popupWidth } from "./shared/sizing";
import { HashRainbowLockup } from "./sign-in/hash-rainbow-lockup";

export const NotEnabled = () => {
  return (
    <Box
      sx={{
        background: ({ palette }) => palette.gray[10],
        px: 6,
        py: 5.5,
        width: popupWidth - 90,
      }}
    >
      <Box mb={2}>
        <HashRainbowLockup sx={{ width: 120 }} />
      </Box>
      <Typography
        variant="smallTextParagraphs"
        sx={{ color: ({ palette }) => palette.gray[90] }}
      >
        The browser extension has not been enabled for your account.
      </Typography>
      <Box mt={3}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ minWidth: "max-content", mt: 1.5 }}
        >
          <Button
            href={FRONTEND_ORIGIN}
            size="small"
            target="_blank"
            variant="primary"
            sx={{ whiteSpace: "no-wrap" }}
          >
            Open HASH
          </Button>
          <Button
            href="https://hash.ai/contact"
            size="small"
            target="_blank"
            variant="tertiary"
          >
            Contact us
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};
