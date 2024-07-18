import "../shared/common.scss";

import { Button } from "@hashintel/design-system";
import { theme } from "@hashintel/design-system/theme";
import { Box, Link, Stack, ThemeProvider, Typography } from "@mui/material";

import { HashLockup } from "../shared/hash-lockup";
import { lightModeBorderColor } from "../shared/style-values";
import { browserName } from "../shared/which-browser";

/**
 * This is a splash screen / focused tab for the window the extension loads to do background scraping work in,
 * so that it's clear to the user what's happening and why the window has appeared.
 */
export const WorkingContents = () => {
  return (
    <ThemeProvider theme={theme}>
      <Box
        className="options"
        sx={({ palette }) => ({
          color: palette.common.black,
          background: palette.gray[10],
          height: "100vh",
          px: 4,
        })}
      >
        <Box sx={{ mx: "auto", maxWidth: 700, pt: "25vh" }}>
          <Box sx={{ mb: 1.5, width: "100%" }}>
            <HashLockup />
          </Box>
          <Typography
            sx={{ fontSize: 34, color: ({ palette }) => palette.gray[70] }}
          >
            Your{" "}
            <Typography
              component="span"
              sx={{ color: ({ palette }) => palette.common.black }}
            >
              HASH for {browserName}
            </Typography>{" "}
            worker is conducting research in this window
          </Typography>
          <Stack direction="row" alignItems="center" mt={6}>
            <Box
              sx={({ palette }) => ({
                background: palette.common.white,
                borderRadius: 2,
                border: `1px solid ${lightModeBorderColor}`,
                display: "inline-block",
                px: 6.5,
                py: 5,
              })}
            >
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[90],
                  fontSize: 20,
                }}
              >
                This window will close automatically
              </Typography>
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[70],
                  fontSize: 17,
                  my: 2,
                }}
              >
                The HASH browser extension is visiting web pages according to
                your research goal, and will tidy up afterwards.
              </Typography>
              <Box>
                <Link
                  href={`${FRONTEND_ORIGIN}/flows`}
                  target="blank"
                  sx={{ fontSize: 16, fontWeight: 600 }}
                >
                  Click here to view currently active flows
                </Link>
              </Box>
            </Box>
            <Box ml={6} sx={{ width: 300 }}>
              <Typography
                variant="smallCaps"
                sx={({ palette }) => ({
                  color: palette.gray[50],
                  display: "block",
                  fontSize: 12,
                })}
              >
                Questions?
              </Typography>
              <Button
                href="https://hash.ai/contact"
                variant="tertiary"
                sx={{ fontSize: 14, mt: 1 }}
                target="_blank"
              >
                Contact us
              </Button>
            </Box>
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  );
};
