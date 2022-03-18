import { Box, Divider, Stack, Typography } from "@mui/material";
import { FC } from "react";
import { Link } from "./Link";
import { Logo } from "./Logo";
import { Spacer } from "./Spacer";

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
    }}
  >
    <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 6, sm: 10 }}>
      <Stack>
        <Logo />
        <Spacer y={2} sm={{ y: 3 }} />
        <Typography sx={{ width: { xs: 1, sm: 271 } }}>
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
            <Typography>Guides</Typography>
            <Typography>Blog</Typography>
            <Typography>FAQs</Typography>
            <Typography>Careers</Typography>
            <Typography>Contact Us</Typography>
            <Typography>Terms of Service</Typography>
          </Stack>
        </Stack>
        <Stack>
          <Typography>Our projects</Typography>
          <Divider />
          {/** @todo where do these go? */}
          {/** @todo badges */}
          <Stack spacing={2}>
            <Link href="https://blockprotocol.org">Block Protocol</Link>
            <Link href="https://hash.ai">HASH</Link>
            <Link href="https://hash.ai">hEngine</Link>
            <Link href="https://core.hash.ai">hCore</Link>
            <Link href="https://hash.ai">hCloud</Link>
          </Stack>
        </Stack>
      </Stack>
    </Stack>
  </Box>
);
