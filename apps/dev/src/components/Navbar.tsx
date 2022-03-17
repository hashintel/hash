import Image from "next/image";
import { Box, Container, Stack } from "@mui/material";
import { VFC } from "react";
import { Button } from "./Button";
import { Link } from "./Link";

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
        <Link href="/" sx={{ display: "flex" }}>
          <Image src="/logo.svg" width={176} height={18.38} />
        </Link>
        <Box sx={{ mr: 2 }} />
        {/** @todo add end icon */}
        <Button size="medium" variant="tertiary" href="https://hash.ai">
          Visit our main site
        </Button>
        <Box sx={{ flex: 1 }} />
        {/** @todo these need to be nav links and need icons */}
        <Button size="medium" variant="tertiary">
          Chat to us on Discord
        </Button>
        <Box sx={{ mr: 2 }} />
        <Button size="medium" variant="primary">
          Join the mailing list
        </Button>
      </Stack>
    </Container>
  </Box>
);
