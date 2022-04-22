import { faBars, faClose } from "@fortawesome/free-solid-svg-icons";
import {
  alpha,
  Box,
  buttonClasses,
  Container,
  Fade,
  IconButton,
  Slide,
  Stack,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { SxProps, Theme } from "@mui/system";
import clsx from "clsx";
import { useRouter } from "next/router";
import { useState, VFC } from "react";
import { Button } from "./Button";
import { FaIcon } from "./icons/FaIcon";
import { FontAwesomeIcon } from "./icons/FontAwesomeIcon";
import { Logo } from "./Logo";

export const NAV_HEIGHT = 58;

const NAV_BUTTON_STYLES: SxProps<Theme> = {
  [`.${buttonClasses.root}`]: {
    "&:not(.NavLink)": {
      "&.MuiButton-primary": {
        borderColor: "yellow.500",
        "&, svg": {
          color: (theme) => `${theme.palette.yellow[900]} !important`,
        },

        ":hover, :focus-visible, &.Button--focus:not(:disabled)": {
          backgroundColor: "yellow.400",
        },
      },

      "&.MuiButton-tertiary": {
        borderColor: "gray.20",

        "&, svg": {
          color: "gray.70",
        },

        ":focus-visible, &.Button--focus:not(:disabled)": {
          borderColor: "gray.40",
        },
      },
    },
  },
};

const DesktopNav: VFC = () => {
  const router = useRouter();

  return (
    <>
      <Button
        size="medium"
        variant="tertiary"
        href="https://hash.ai"
        endIcon={<FaIcon name="arrow-up-right-from-square" type="solid" />}
      >
        Visit our main site
      </Button>
      <Stack
        direction="row"
        spacing={2}
        ml="auto"
        sx={[
          NAV_BUTTON_STYLES,
          {
            [`.${buttonClasses.root}`]: {
              minHeight: 32,
              py: 1,
              borderRadius: 30,
              borderWidth: 1,

              "&:after": {
                borderWidth: 3,
                left: -6,
                top: -6,
                right: -6,
                bottom: -6,
              },
            },
          },
        ]}
      >
        <Button
          size="medium"
          className={clsx("NavLink", {
            active: router.asPath.startsWith("/blog"),
          })}
          href="/blog"
          startIcon={<FaIcon name="newspaper" type="solid" />}
        >
          Blog
        </Button>
        <Button
          size="medium"
          variant="tertiary"
          startIcon={<FaIcon name="discord" type="brands" />}
          href="https://hash.ai/discord"
          sx={(theme) => ({
            [theme.breakpoints.down(980)]: { display: "none" },
          })}
        >
          Chat to us on Discord
        </Button>
        <Button
          size="medium"
          variant="primary"
          startIcon={<FaIcon name="envelope" type="regular" />}
          href="#subscribe"
        >
          Join the mailing list
        </Button>
      </Stack>
    </>
  );
};

const MobileNavButton: VFC<{ open: boolean; onOpenToggle: () => void }> = ({
  open,
  onOpenToggle,
}) => (
  <IconButton
    sx={{
      ml: "auto",
    }}
    onClick={() => onOpenToggle()}
  >
    <FontAwesomeIcon
      icon={open ? faClose : faBars}
      sx={{
        color: "gray.50",
        fontSize: 24,
      }}
    />
  </IconButton>
);

const MobileNav: VFC<{ open: boolean; onMenuClose: () => void }> = ({
  open,
  onMenuClose,
}) => {
  const router = useRouter();
  return (
    <>
      <Fade in={open}>
        <Box
          sx={{
            position: "fixed",
            width: 1,
            top: NAV_HEIGHT,
            bottom: 0,
            height: 1,
            bgcolor: (theme) => alpha(theme.palette.gray[40], 0.4),
            zIndex: (theme) => theme.zIndex.appBar - 2,
          }}
        />
      </Fade>
      <Slide in={open}>
        <Box
          sx={[
            NAV_BUTTON_STYLES,
            {
              position: "fixed",
              width: 1,
              top: NAV_HEIGHT,
              bgcolor: "white",
              zIndex: (theme) => theme.zIndex.appBar - 1,
              left: 0,
              [`.${buttonClasses.startIcon}, .${buttonClasses.endIcon}`]: {
                svg: {
                  fontSize: "18px !important",
                },
              },
              boxShadow: `
              0px 51px 87px rgba(50, 65, 111, 0.07),
              0px 33.0556px 50.9514px rgba(50, 65, 111, 0.0531481),
              0px 19.6444px 27.7111px rgba(50, 65, 111, 0.0425185),
              0px 10.2px 14.1375px rgba(50, 65, 111, 0.035),
              0px 4.15556px 7.08889px rgba(50, 65, 111, 0.0274815),
              0px 0.944444px 3.42361px rgba(50, 65, 111, 0.0168519)
            `,
              borderRadius: "0px 0px 6px 6px",
            },
          ]}
        >
          <Container
            sx={{
              pt: 1,
              pb: 3.5,
            }}
          >
            <Stack
              spacing={2}
              alignItems="flex-start"
              divider={
                <Box
                  component="hr"
                  sx={{
                    border: 0,
                    borderTop: 1,
                    borderColor: "gray.20",
                    width: 1,
                  }}
                />
              }
              mb={4}
            >
              <Button
                className="NavLink"
                size="large"
                variant="primary"
                href="https://hash.ai"
                startIcon={
                  <FaIcon name="arrow-up-right-from-square" type="solid" />
                }
              >
                Visit our main site
              </Button>
              <Button
                size="large"
                variant="primary"
                startIcon={<FaIcon name="newspaper" type="solid" />}
                href="/blog"
                className={clsx("NavLink", {
                  active: router.asPath.startsWith("/blog"),
                })}
                onClick={() => onMenuClose()}
              >
                Blog
              </Button>
            </Stack>
            <Stack spacing={1.25}>
              <Button
                variant="tertiary"
                startIcon={<FaIcon name="discord" type="brands" />}
                size="large"
                href="https://hash.ai/discord"
              >
                Chat to us on Discord
              </Button>
              <Button
                size="large"
                variant="primary"
                startIcon={<FaIcon name="envelope" type="regular" />}
                href="#subscribe"
                onClick={() => onMenuClose()}
              >
                Join the mailing list
              </Button>
            </Stack>
          </Container>
        </Box>
      </Slide>
    </>
  );
};

export const Navbar: VFC = () => {
  const theme = useTheme();
  const mobileNav = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!mobileNav && mobileNavOpen) {
    setMobileNavOpen(false);
  }

  return (
    <>
      <Box
        sx={{
          display: "flex",
          height: NAV_HEIGHT,
          bgcolor: "white",
          alignItems: "center",
          position: "fixed",
          width: "100%",
          zIndex: "appBar",
        }}
        component="nav"
      >
        <Container>
          <Stack
            direction="row"
            alignItems="center"
            sx={{ alignItems: "center" }}
          >
            <Logo mr={2} onClick={() => setMobileNavOpen(false)} />
            {mobileNav ? (
              <MobileNavButton
                open={mobileNavOpen}
                onOpenToggle={() => setMobileNavOpen(!mobileNavOpen)}
              />
            ) : (
              <DesktopNav />
            )}
          </Stack>
        </Container>
      </Box>
      {mobileNav ? (
        <MobileNav
          open={mobileNavOpen}
          onMenuClose={() => setMobileNavOpen(false)}
        />
      ) : null}
      <Box height={NAV_HEIGHT} />
    </>
  );
};
