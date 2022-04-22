import { Box, Container, Stack, Typography } from "@mui/material";
import { BoxProps } from "@mui/system";
import axios from "axios";
import { useState, VFC } from "react";
import { unstable_batchedUpdates } from "react-dom";
import { Button } from "./Button";
import { FaIcon } from "./icons/FaIcon";
import { NAV_HEIGHT } from "./Navbar";
import { TextField } from "./TextField";

// Taken from http://emailregex.com/
const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export const Subscribe: VFC<BoxProps> = (props) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userJoined, setUserJoined] = useState<boolean>(false);

  return (
    <Box
      {...props}
      id="subscribe"
      sx={{
        pt: `${NAV_HEIGHT}px`,
        mt: `-${NAV_HEIGHT}px`,
      }}
    >
      <Box
        sx={[
          {
            py: 8,
            px: 20,
            border: 2,
            borderColor: "orange.400",
            textAlign: "center",

            ".MuiTypography-hashHeading2": {
              mb: {
                xs: 1.5,
                md: 2,
              },
            },
            ".MuiTypography-hashBodyCopy": {
              maxWidth: 683,
              mx: "auto",
              lineHeight: {
                xs: 1.4,
                md: 1.5,
              },
            },
          },
          (theme) => ({
            [theme.breakpoints.up("md")]: {
              py: 8,
              px: 20,
            },
            [theme.breakpoints.down("md")]: {
              px: 3,
              py: 4,
            },
          }),
        ]}
      >
        {userJoined ? (
          <>
            <Box
              sx={{
                color: "yellow.500",
                fontWeight: 900,
                fontSize: 48,
                lineHeight: 1,
                mb: 2,
              }}
            >
              <FaIcon name="envelope-dot" type="solid" />
            </Box>
            <Typography variant="hashHeading2" component="h3">
              Success! You’re on the list
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="hashHeading2" component="h3">
              Stay up to date with HASH news
            </Typography>
            <Typography mb={3}>
              Subscribe to our mailing list to get our monthly newsletter –
              you’ll be first to hear about partnership opportunities, new
              releases, and product updates
            </Typography>
            <form
              noValidate
              onSubmit={async (evt) => {
                evt.preventDefault();
                const formData = new FormData(evt.target as HTMLFormElement);
                const email = formData.get("email")! as string;

                try {
                  const isEmailValid = EMAIL_REGEX.test(email);
                  if (!isEmailValid) {
                    setError("Please enter a valid email address");
                    return;
                  }

                  unstable_batchedUpdates(() => {
                    setError(null);
                    setLoading(true);
                  });

                  const { data } = await axios.post("/api/subscribe", {
                    email,
                  });

                  unstable_batchedUpdates(() => {
                    setLoading(false);

                    if (data.response.status === "subscribed") {
                      setUserJoined(true);
                    } else if (
                      data.response?.title?.includes("Invalid Resource")
                    ) {
                      setError("Are you sure? Please try a different address…");
                    } else {
                      setError("Something went wrong.️ Please try again later");
                    }
                  });
                } catch (err) {
                  // eslint-disable-next-line no-console
                  console.log(error);
                  unstable_batchedUpdates(() => {
                    setLoading(false);
                    setError("Something went wrong.️ Please try again later");
                  });
                }
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="center"
                alignItems="flex-start"
                spacing={{ xs: 1, md: 1.5 }}
              >
                <TextField
                  sx={{ width: { md: 459, xs: 1 }, flexShrink: 1 }}
                  name="email"
                  type="email"
                  disabled={loading}
                  placeholder="you@example.com"
                  error={error !== null}
                  helperText={error !== null ? error : undefined}
                />
                <Button
                  variant="primary"
                  size="large"
                  type="submit"
                  loading={loading}
                  sx={{ width: { xs: 1, md: "initial" } }}
                >
                  Join
                </Button>
              </Stack>
            </form>
          </>
        )}
      </Box>
    </Box>
  );
};

const Community: VFC = () => {
  return (
    <Box
      sx={{
        pb: { xs: 10, sm: 11, md: 12 },
        pt: 2,
        minHeight: 260,
        background: `
         linear-gradient(1.3deg, #FFD79B -10.15%, rgba(255, 239, 198, 0) 66.01%)
        `,
      }}
      component="section"
    >
      <Container>
        <Typography
          variant="hashHeading4"
          sx={{ fontWeight: 600, color: "gray.90", mb: { xs: 4, sm: 5 } }}
          align="center"
        >
          Join our community of HASH developers
        </Typography>
        <Box>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={2}
            justifyContent="center"
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="center"
            >
              <Button
                variant="primarySquare"
                size="large"
                href="https://hash.ai/discord"
                startIcon={<FaIcon name="discord" type="brands" />}
              >
                Join our Discord
              </Button>
              <Button
                variant="primarySquare"
                size="large"
                href="https://github.com/hashintel/hash/issues"
                startIcon={<FaIcon name="comment-code" type="solid" />}
              >
                Browse open issues
              </Button>
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="center"
            >
              <Button
                variant="primarySquare"
                size="large"
                href="https://github.com/hashintel/hash/stargazers"
                startIcon={<FaIcon name="github" type="brands " />}
              >
                Star us on Github
              </Button>
              <Button
                variant="primarySquare"
                size="large"
                href="https://hash.ai/contact"
                startIcon={<FaIcon name="envelope" type="regular" />}
              >
                Get in touch
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

export const PreFooter: VFC<{ subscribe?: boolean }> = ({
  subscribe = true,
}) => (
  <>
    {subscribe ? (
      <Container component="section" sx={{ mb: 16, mt: 12 }}>
        <Subscribe />
      </Container>
    ) : null}
    <Community />
  </>
);
