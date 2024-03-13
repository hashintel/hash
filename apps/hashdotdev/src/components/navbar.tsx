import {
  faArrowUpRightFromSquare,
  faBars,
  faClose,
} from "@fortawesome/free-solid-svg-icons";
import {
  alpha,
  Box,
  BoxProps,
  buttonClasses,
  ButtonProps,
  Container,
  ContainerProps,
  Fade,
  IconButton,
  Slide,
  Stack,
  styled,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import clsx from "clsx";
import { useRouter } from "next/router";
import {
  FunctionComponent,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { SiteMapContext } from "../pages/shared/sitemap-context";
import { Button } from "./button";
import { DiscordIcon } from "./icons/discord-icon";
import { EnvelopeRegularIcon } from "./icons/envelope-regular-icon";
import { FontAwesomeIcon } from "./icons/font-awesome-icon";
import { Logo } from "./logo";
import { MobileNavItems } from "./navbar/mobile-nav-items";
import { useHydrationFriendlyAsPath } from "./navbar/use-hydration-friendly-as-path";
import { pageTitleToIcons } from "./navbar/util";

export const NAV_HEIGHT = 58;

const DesktopNavLink = styled((props: ButtonProps) => <Button {...props} />)({
  [`&.${buttonClasses.root}`]: {
    fontWeight: 500,
    background: "transparent",
    borderColor: "transparent",
    fontSize: 15,
    minHeight: 32,
    py: 1,
    borderRadius: 30,
    borderWidth: 1,
  },
});

const DesktopNav: FunctionComponent = () => {
  const router = useRouter();
  const { pages } = useContext(SiteMapContext);

  return (
    <>
      <Button
        size="medium"
        variant="tertiary"
        href="https://hash.ai"
        openInNew
        endIcon={<FontAwesomeIcon icon={faArrowUpRightFromSquare} />}
        sx={{
          color: ({ palette }) => palette.aqua[100],
          background: "rgba(255, 255, 255, 0.80)",
        }}
      >
        Visit our main site
      </Button>
      <Stack direction="row" spacing={0.5} ml="auto">
        {pages.map(({ title, href }) => (
          <DesktopNavLink
            key={href}
            href={href}
            startIcon={pageTitleToIcons[title]}
            className={clsx("nav-link", {
              active: router.asPath.startsWith(href),
            })}
          >
            {title}
          </DesktopNavLink>
        ))}
      </Stack>
    </>
  );
};

const MobileNavButton: FunctionComponent<{
  open: boolean;
  onOpenToggle: () => void;
}> = ({ open, onOpenToggle }) => (
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

const MobileNav: FunctionComponent<{
  open: boolean;
  onMenuClose: () => void;
}> = ({ open, onMenuClose }) => {
  const hydrationFriendlyAsPath = useHydrationFriendlyAsPath();

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
            {
              position: "fixed",
              width: 1,
              top: NAV_HEIGHT,
              overflow: "auto",
              maxHeight: `calc(100vh - ${NAV_HEIGHT}px)`,
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
              pb: 3.5,
            }}
          >
            <Box
              sx={{
                overflowY: "auto",
                overflowX: "hidden",
                overscrollBehavior: "contain",
                marginBottom: 2,
                borderTopColor: ({ palette }) => palette.gray[20],
                borderTopWidth: 1,
                borderTopStyle: "solid",
              }}
            >
              <MobileNavItems
                hydrationFriendlyAsPath={hydrationFriendlyAsPath}
                onClose={onMenuClose}
              />
            </Box>
            <Stack spacing={1.25}>
              <Button
                variant="tertiary"
                startIcon={<DiscordIcon />}
                size="large"
                href="https://hash.ai/discord"
              >
                Chat to us on Discord
              </Button>
              <Button
                size="large"
                variant="primary"
                startIcon={<EnvelopeRegularIcon />}
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

export const Navbar: FunctionComponent<{
  logoEndAdornment?: ReactNode;
  sx?: BoxProps["sx"];
  containerSx?: ContainerProps["sx"];
}> = ({ logoEndAdornment, sx, containerSx }) => {
  const theme = useTheme();
  const mobileNav = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isAtTopOfPage, setIsAtTopOfPage] = useState(true);

  if (!mobileNav && mobileNavOpen) {
    setMobileNavOpen(false);
  }

  useEffect(() => {
    const checkScrollPosition = () => {
      setIsAtTopOfPage(window.scrollY === 0);
    };

    checkScrollPosition();

    window.addEventListener("scroll", checkScrollPosition);

    return () => {
      window.removeEventListener("scroll", checkScrollPosition);
    };
  }, []);

  const isWhiteBackground = !isAtTopOfPage || mobileNavOpen;

  return (
    <>
      <Box
        sx={[
          {
            display: "flex",
            height: NAV_HEIGHT,
            transition: ({ transitions }) => transitions.create("background"),
            background: isWhiteBackground
              ? "#fff"
              : "rgba(255, 255, 255, 0.20)",
            borderBottomWidth: 1,
            borderBottomStyle: "solid",
            borderBottomColor: "rgba(255, 255, 255, 0.17)",
            alignItems: "center",
            position: "fixed",
            width: "100%",
            zIndex: "appBar",
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        component="nav"
      >
        <Container sx={containerSx}>
          <Stack
            direction="row"
            alignItems="center"
            sx={{
              alignItems: "center",
              [`.${buttonClasses.root}.nav-link`]: {
                color: isWhiteBackground
                  ? theme.palette.gray[70]
                  : theme.palette.aqua[100],
                [`> .${buttonClasses.startIcon} svg`]: {
                  color: isWhiteBackground
                    ? theme.palette.gray[70]
                    : theme.palette.aqua[100],
                },
                "&:hover:not(.active)": {
                  color: isWhiteBackground
                    ? theme.palette.gray[90]
                    : theme.palette.common.black,
                  borderColor: isWhiteBackground
                    ? theme.palette.aqua[30]
                    : "transparent",
                  background: isWhiteBackground
                    ? "transparent"
                    : "rgba(255, 255, 255, 0.50)",
                  [`> .${buttonClasses.startIcon} svg`]: {
                    color: isWhiteBackground
                      ? theme.palette.gray[90]
                      : theme.palette.common.black,
                  },
                },
                "&.active": {
                  background: theme.palette.teal[20],
                  [`> .${buttonClasses.startIcon} svg`]: {
                    color: isWhiteBackground
                      ? theme.palette.teal[90]
                      : theme.palette.aqua[100],
                  },
                },
              },
            }}
          >
            <Box mr={2} display="flex">
              <Logo onClick={() => setMobileNavOpen(false)} />
              {logoEndAdornment}
            </Box>
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
