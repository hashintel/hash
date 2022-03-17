import { Box, Stack } from "@mui/material";
import { FC } from "react";
import { Logo } from "./Logo";
import { Spacer } from "./Spacer";

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
    <Stack direction="row" spacing={10}>
      <Stack>
        <Logo />
        <Spacer y={3} />
      </Stack>
    </Stack>
  </Box>
);
