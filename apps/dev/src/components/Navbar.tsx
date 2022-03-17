import { Box, Container, Stack } from "@mui/material";
import { VFC } from "react";
import { Button } from "./Button";
import { Logo } from "./Logo";
import { Spacer } from "./Spacer";

export const Navbar: VFC = () => (
  <Box
    sx={{
      display: "flex",
      height: 58,
      bgcolor: "white",
      alignItems: "center",
    }}
  >
    <Container>
      <Stack direction="row" sx={{ alignItems: "center" }}>
        <Logo />
        <Spacer x={2} />
        {/** @todo add end icon */}
        <Button size="medium" variant="tertiary" href="https://hash.ai">
          Visit our main site
        </Button>
        <Spacer flex />
        {/** @todo these need to be nav links and need icons */}
        <Button size="medium" variant="tertiary">
          Chat to us on Discord
        </Button>
        <Spacer x={2} />
        <Button size="medium" variant="primary">
          Join the mailing list
        </Button>
      </Stack>
    </Container>
  </Box>
);
