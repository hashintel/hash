import { faBars, faClose } from "@fortawesome/free-solid-svg-icons";
import {
  alpha,
  Box,
  buttonClasses,
  ButtonProps,
  Container,
  Fade,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Slide,
  Stack,
  styled,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import clsx from "clsx";
import { useRouter } from "next/router";
import { FunctionComponent, ReactNode, useEffect, useState } from "react";

import { Button } from "./button";
import { FaIcon } from "./icons/fa-icon";
import { FontAwesomeIcon } from "./icons/font-awesome-icon";
import { Link } from "./link";
import { Logo } from "./logo";

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

const navLinks: { icon: ReactNode; name: string; href: string }[] = [
  {
    icon: <FaIcon name="diagram-sankey" type="solid" />,
    name: "Roadmap",
    href: "/roadmap",
  },
  {
    icon: <FaIcon name="book-atlas" type="regular" />,
    name: "Docs",
    href: "/docs",
  },
  {
    icon: <FaIcon name="map" type="solid" />,
    name: "Tutorials",
    href: "/tutorials",
  },
  {
    icon: <FaIcon name="newspaper" type="solid" />,
    name: "Blog",
    href: "/blog",
  },
];

const DesktopNav: FunctionComponent = () => {
  const router = useRouter();

  return (
    <>
      <Button
        size="medium"
        variant="tertiary"
        href="https://hash.ai"
        openInNew
        endIcon={<FaIcon name="arrow-up-right-from-square" type="solid" />}
        sx={{
          color: ({ palette }) => palette.turquoise[100],
          background: "rgba(255, 255, 255, 0.80)",
        }}
      >
        Visit our main site
      </Button>
      <Stack direction="row" spacing={0.5} ml="auto">
        {navLinks.map(({ icon, name, href }) => (
          <DesktopNavLink
            key={href}
            href={href}
            startIcon={icon}
            className={clsx("nav-link", {
              active: router.asPath.startsWith(href),
            })}
          >
            {name}
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
              pb: 3.5,
            }}
          >
            <MenuList
              sx={{
                marginBottom: 2,
                borderTopColor: ({ palette }) => palette.gray[20],
                borderTopWidth: 1,
                borderTopStyle: "solid",
              }}
            >
              {navLinks.map(({ icon, name, href }) => {
                const isActive = router.asPath.startsWith(href);
                return (
                  <Link key={href} href={href}>
                    <MenuItem
                      component="a"
                      className={clsx({ active: isActive })}
                    >
                      <ListItemIcon>{icon}</ListItemIcon>
                      <ListItemText>{name}</ListItemText>
                    </MenuItem>
                  </Link>
                );
              })}
            </MenuList>
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

export const Navbar: FunctionComponent = () => {
  const router = useRouter();
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
        sx={{
          display: "flex",
          height: NAV_HEIGHT,
          transition: ({ transitions }) => transitions.create("background"),
          background: isWhiteBackground ? "#fff" : "rgba(255, 255, 255, 0.20)",
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
            sx={{
              alignItems: "center",
              [`.${buttonClasses.root}.nav-link`]: {
                color: isWhiteBackground
                  ? theme.palette.gray[70]
                  : theme.palette.turquoise[100],
                [`> .${buttonClasses.startIcon} svg`]: {
                  color: isWhiteBackground
                    ? theme.palette.gray[70]
                    : theme.palette.turquoise[100],
                },
                "&:hover:not(.active)": {
                  color: isWhiteBackground
                    ? theme.palette.gray[90]
                    : theme.palette.common.black,
                  borderColor: isWhiteBackground
                    ? theme.palette.turquoise[30]
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
                      : theme.palette.turquoise[100],
                  },
                },
              },
            }}
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
