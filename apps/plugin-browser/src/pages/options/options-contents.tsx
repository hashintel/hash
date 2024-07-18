import "../shared/common.scss";

import { Button } from "@hashintel/design-system";
import { theme } from "@hashintel/design-system/theme";
import { Box, Skeleton, Stack, ThemeProvider, Typography } from "@mui/material";
import browser from "webextension-polyfill";

import { HashLockup } from "../shared/hash-lockup";
import { lightModeBorderColor } from "../shared/style-values";
// eslint-disable-next-line no-restricted-imports
import { useUserValue } from "../shared/use-user-value";
import { browserName } from "../shared/which-browser";

/**
 * This can be used for onboarding instructions, and for user preferences.
 *
 * Preferences should be loaded and persisted using {@link useStorageSync}
 */
export const OptionsContents = () => {
  const { user, loading } = useUserValue();

  const version = browser.runtime.getManifest().version;

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
            Get started with{" "}
            <Typography
              component="span"
              sx={{ color: ({ palette }) => palette.common.black }}
            >
              HASH for {browserName}
            </Typography>
            <Typography
              component="span"
              sx={{
                color: ({ palette }) => palette.gray[40],
                ml: 1,
              }}
            >
              v{version}
            </Typography>
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
              {loading ? (
                <Skeleton
                  sx={{ borderRadius: 1, height: 100 }}
                  variant="rectangular"
                />
              ) : user ? (
                <>
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[90],
                      fontSize: 20,
                    }}
                  >
                    Welcome, {user.properties.displayName}
                  </Typography>
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[70],
                      fontSize: 17,
                      mt: 2,
                    }}
                  >
                    Click on the extension icon to get started.
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="smallCaps" sx={{ fontSize: 12 }}>
                    Connect to HASH
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Box sx={{ mb: 1.5 }}>
                      <Button
                        href={`${FRONTEND_ORIGIN}/signup`}
                        target="_blank"
                        sx={{ fontSize: 14 }}
                        variant="primary"
                      >
                        Create a free account
                      </Button>
                    </Box>
                    <Button
                      href={`${FRONTEND_ORIGIN}/signin`}
                      size="small"
                      target="_blank"
                      sx={({ palette }) => ({
                        background: palette.gray[90],
                        color: palette.common.white,
                        fontSize: 14,

                        "&:hover": {
                          background: palette.gray[80],
                          color: palette.common.white,
                        },
                      })}
                      variant="tertiary"
                    >
                      Sign in to an existing account
                    </Button>
                  </Box>
                </>
              )}
            </Box>
            <Box ml={6}>
              <Typography
                variant="smallCaps"
                sx={({ palette }) => ({
                  color: palette.gray[50],
                  display: "block",
                  fontSize: 12,
                })}
              >
                Get help
              </Typography>
              <Button
                href="https://hash.ai/contact"
                variant="tertiary"
                sx={{ fontSize: 14, mt: 1 }}
                target="_blank"
              >
                Report an issue
              </Button>
            </Box>
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  );
};
