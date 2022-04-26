import { Box, Container, Divider, Stack, Typography } from "@mui/material";
import { ComponentProps, FC, ReactNode } from "react";
import { SITE_DESCRIPTION } from "../config";
import { DiscordIcon } from "./icons/DiscordIcon";
import { GithubIcon } from "./icons/GithubIcon";
import { TwitterIcon } from "./icons/TwitterIcon";
import { Link } from "./Link";
import { Logo } from "./Logo";
import { Spacer } from "./Spacer";

const FooterLink: FC<
  { href: string } & Omit<ComponentProps<typeof Typography>, "variant">
> = ({ href, sx = [], children, ...props }) => (
  <Link href={href}>
    <Typography
      {...props}
      sx={[
        ...(Array.isArray(sx) ? sx : [sx]),
        { display: "flex", whiteSpace: "nowrap" },
      ]}
      variant="hashSmallTextMedium"
    >
      {children}
    </Typography>
  </Link>
);

const FooterLinkWithLabel: FC<
  ComponentProps<typeof FooterLink> & {
    type: "open" | "fair";
  }
> = ({ type, children, ...props }) => {
  return (
    <FooterLink {...props}>
      <Box component="span" position="relative">
        {children}
        <Typography
          sx={[
            (theme) => theme.typography.hashSmallCaps,
            {
              color: type === "open" ? "purple.600" : "blue.700",
            },
            (theme) => ({
              [theme.breakpoints.up("sm")]: {
                position: "absolute",
                left: "100%",
                top: "50%",
                transform: `translateX(${theme.spacing(1)}) translateY(-50%)`,
              },
              [theme.breakpoints.down("sm")]: {
                display: "block",
              },
            }),
          ]}
          component="span"
        >
          {type[0]!.toUpperCase() + type.slice(1)} Source
        </Typography>
      </Box>
    </FooterLink>
  );
};

export const FooterSection: FC<{ label: ReactNode }> = ({
  label,
  children,
}) => (
  <Stack spacing={2}>
    <Stack spacing={1}>
      <Typography variant="hashFooterHeading">{label}</Typography>
      <Divider sx={{ borderColor: "gray.30" }} />
    </Stack>
    {children}
  </Stack>
);

export const Footer: FC = () => (
  <Box
    component="footer"
    sx={{
      py: {
        xs: 6,
        lg: 8,
      },
      background: "linear-gradient(359.56deg, #FFFFFF 59.36%, #F7F8FA 99.57%)",
      boxShadow: "0px -2px 16px rgba(254, 177, 115, 0.2)",
      borderTop: 4,
      borderColor: "white",

      "& a:hover": {
        bgcolor: "transparent",
      },
    }}
  >
    <Container>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 6, md: 10 }}
      >
        <Stack>
          <Logo />
          <Spacer y={2} sm={{ y: 3 }} />
          <Typography
            sx={{ width: { xs: 1, md: 289 }, mb: 4.5 }}
            variant="hashSmallText"
          >
            {SITE_DESCRIPTION}
          </Typography>
          <Typography variant="hashSocialIconLink">
            <Stack direction="row" spacing={3}>
              <Link href="https://github.com/hashintel/hash">
                <GithubIcon fontSize="inherit" />
              </Link>
              <Link href="https://twitter.com/hashintel">
                <TwitterIcon fontSize="inherit" />
              </Link>
              <Link href="https://hash.ai/discord">
                <DiscordIcon fontSize="inherit" />
              </Link>
            </Stack>
          </Typography>
        </Stack>
        <Stack direction="row" spacing={{ xs: 6, md: 10 }}>
          <FooterSection label="Resources">
            <FooterLink href="https://hash.ai/careers">Careers</FooterLink>
            <FooterLink href="https://hash.ai/contact">Contact Us</FooterLink>
            <FooterLink href="https://hash.ai/legal/terms">Terms</FooterLink>
            <FooterLink href="https://hash.ai/legal/privacy">
              Privacy
            </FooterLink>
          </FooterSection>
          <FooterSection label="Our projects">
            <FooterLinkWithLabel type="open" href="https://blockprotocol.org">
              Block Protocol
            </FooterLinkWithLabel>
            <FooterLinkWithLabel type="open" href="https://hash.ai">
              HASH
            </FooterLinkWithLabel>
            <FooterLinkWithLabel
              type="fair"
              href="https://hash.ai/platform/engine"
            >
              hEngine
            </FooterLinkWithLabel>
            <FooterLink href="https://hash.ai/platform/core">hCore</FooterLink>
            <FooterLink href="https://hash.ai/platform/cloud">
              hCloud
            </FooterLink>
          </FooterSection>
        </Stack>
      </Stack>
    </Container>
  </Box>
);
