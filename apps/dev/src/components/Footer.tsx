import { Box, Divider, Stack, Typography } from "@mui/material";
import { ComponentProps, FC, ReactNode } from "react";
import { Link } from "./Link";
import { Logo } from "./Logo";
import { Spacer } from "./Spacer";

const FooterLink: FC<
  { href: string } & Omit<ComponentProps<typeof Typography>, "variant">
> = ({ href, children, ...props }) => (
  <Link href={href}>
    <Typography {...props} variant="hashSmallTextMedium">
      {children}
    </Typography>
  </Link>
);

const FooterLinkWithLabel: FC<
  ComponentProps<typeof FooterLink> & {
    type: "open" | "fair";
  }
> = ({ type, sx = [], children, ...props }) => {
  return (
    <FooterLink
      {...props}
      sx={[
        ...(Array.isArray(sx) ? sx : [sx]),
        { display: "flex", whiteSpace: "nowrap" },
      ]}
    >
      <Box position="relative">
        {children}
        <Typography
          sx={[
            (theme) => theme.typography.hashSmallCaps,
            {
              color: type === "open" ? "purple.600" : "blue.700",
              position: "absolute",
              left: "100%",
              top: "50%",
              transform: (theme) =>
                `translateX(${theme.spacing(1)}) translateY(-50%)`,
            },
          ]}
          component="span"
        >
          {type[0].toUpperCase() + type.slice(1)} Source
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
      px: {
        xs: 3,
        lg: 15,
      },
      py: {
        xs: 6,
        lg: 8,
      },
      // @todo check palette for colours
      background: "linear-gradient(359.56deg, #FFFFFF 59.36%, #F7F8FA 99.57%)",
      boxShadow: "0px -2px 16px rgba(254, 177, 115, 0.2)",
      border: 4,
      borderColor: "white",
    }}
  >
    <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 6, md: 10 }}>
      <Stack>
        <Logo />
        <Spacer y={2} sm={{ y: 3 }} />
        <Typography sx={{ width: { xs: 1, md: 289 } }} variant="hashSmallText">
          Open-source resources and tools for developers who want to build the
          future of decision-making with HASH
        </Typography>
        {/** @todo icon row */}
      </Stack>
      {/** @todo link hover styles */}
      <Stack direction="row" spacing={{ xs: 6, md: 10 }}>
        <FooterSection label="Resources">
          <FooterLink href="https://hash.ai/careers">Careers</FooterLink>
          <FooterLink href="https://hash.ai/contact">Contact Us</FooterLink>
          <FooterLink href="https://hash.ai/legal/terms">
            Terms of Service
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
          <FooterLink href="https://hash.ai/platform/cloud">hCloud</FooterLink>
        </FooterSection>
      </Stack>
    </Stack>
  </Box>
);
