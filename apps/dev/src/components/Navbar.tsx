import { Box, Container, Stack } from "@mui/material";
import { VFC } from "react";
import { Button } from "./Button";
import { FaIcon } from "./icons/FaIcon";
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
          <Button
            size="medium"
            variant="tertiary"
            href="https://hash.ai"
            endIcon={<FaIcon name="arrow-up-right-from-square" type="solid" />}
          >
            Visit our main site
          </Button>
          <Spacer flex />
          {/** @todo these need to be nav links */}
          <Button
            size="medium"
            variant="tertiary"
            startIcon={<FaIcon name="discord" type="brands" />}
          >
            Chat to us on Discord
          </Button>
          <Spacer x={2} />
          <Button
            size="medium"
            variant="primary"
            startIcon={<FaIcon name="envelope" type="regular" />}
          >
            Join the mailing list
          </Button>
        </Stack>
      </Container>
    </Box>
    <Box height={NAV_HEIGHT} />
  </>
);
