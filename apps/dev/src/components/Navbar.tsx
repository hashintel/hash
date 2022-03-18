import { Box, Container, Stack } from "@mui/material";
import { VFC } from "react";
import { Button } from "./Button";
import { Logo } from "./Logo";
import { Spacer } from "./Spacer";

const NAV_HEIGHT = 58;

export const Navbar: VFC = () => (
  <>
    <Box
      sx={{
        display: "flex",
        height: NAV_HEIGHT,
        bgcolor: "white",
        alignItems: "center",
        position: "fixed",
        width: "100%",
        zIndex: (theme) => theme.zIndex.appBar,
      }}
      component="nav"
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
    <Box height={NAV_HEIGHT} />
  </>
);
