import { Box, Divider, Stack, Typography } from "@mui/material";
import { FC } from "react";
import { Link } from "./Link";
import { Logo } from "./Logo";
import { Spacer } from "./Spacer";

const FooterLinkLabel: FC = ({ children }) => (
  <Typography
    sx={{ color: "purple.600", textTransform: "uppercase" }}
    as="span"
  >
    {children}
  </Typography>
);

/**
 * @todo Fonts, colors, etc
 */
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
      background: "linear-gradient(359.56deg, #FFFFFF 59.36%, #F7F8FA 99.57%)",
      "&, a": {
        color: "gray.70",
      },
    }}
  >
    <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 6, sm: 10 }}>
      <Stack>
        <Logo />
        <Spacer y={2} sm={{ y: 3 }} />
        <Typography sx={{ width: { xs: 1, sm: 271 }, color: "inherit" }}>
          Open-source resources and tools for developers who want to build the
          future of decision-making with HASH
        </Typography>
        {/** @todo icon row */}
      </Stack>
      <Stack direction="row" spacing={{ xs: 6, sm: 10 }}>
        <Stack>
          <Typography>Resources</Typography>
          <Divider />
          <Stack spacing={2}>
            <Link href="#">Guides</Link>
            <Link href="#">Blog</Link>
            <Link href="#">FAQs</Link>
            <Link href="#">Careers</Link>
            <Link href="#">Contact Us</Link>
            <Link href="#">Terms of Service</Link>
          </Stack>
        </Stack>
        <Stack>
          <Typography>Our projects</Typography>
          <Divider />
          {/** @todo where do these go? */}
          {/** @todo badges */}
          <Stack spacing={2}>
            <Link href="https://blockprotocol.org">
              Block Protocol <FooterLinkLabel>Open Source</FooterLinkLabel>
            </Link>
            <Link href="https://hash.ai">
              HASH <FooterLinkLabel>Open Source</FooterLinkLabel>
            </Link>
            <Link href="https://hash.ai">
              hEngine <FooterLinkLabel>Fair Source</FooterLinkLabel>
            </Link>
            <Link href="https://core.hash.ai">hCore</Link>
            <Link href="https://hash.ai">hCloud</Link>
          </Stack>
        </Stack>
      </Stack>
    </Stack>
  </Box>
);
