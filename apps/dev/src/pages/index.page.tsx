import { Box, Container, Stack, Typography } from "@mui/material";
import type { NextPage } from "next";
import Head from "next/head";
import { ComponentProps, VFC } from "react";

const HeroDivider: VFC<ComponentProps<typeof Stack>> = (props) => {
  const bgcolor = "orange.400";
  const size = 12;
  return (
    <Stack {...props} direction="row" alignItems="stretch" height={size}>
      <Box sx={{ width: 5 * size, bgcolor }} />
      <Box sx={{ width: 3 * size, bgcolor, opacity: 0.5 }} />
      <Box sx={{ width: 2 * size, bgcolor, opacity: 0.2 }} />
      <Box sx={{ width: size, bgcolor, opacity: 0 }} />
      <Box sx={{ width: size, bgcolor, opacity: 0.2 }} />
    </Stack>
  );
};

const Hero: VFC = () => (
  <Box
    component="header"
    py={16}
    sx={{
      background: "url(/gradient.png) no-repeat",
      backgroundPosition: "right top",
    }}
  >
    <Container>
      <Box width={{ xs: 1, md: 871 }}>
        <Typography variant="hashHeading4" component="h1" mb={3}>
          HASH for Developers
        </Typography>
        <Typography variant="hashHeading1" component="h2" mb={5}>
          Help build the future of decision-making
        </Typography>
        <HeroDivider mb={5} />
        <Box width={{ xs: 1, md: 550 }}>
          <Typography mb={2} sx={{ lineHeight: 1.5 }}>
            HASH is an organization building the next generation of simulation,
            decision-making, and knowledge management tools.
          </Typography>
          <Typography sx={{ lineHeight: 1.5 }}>
            Here you’ll find resources for developers who want to use our open
            source projects and build blocks, plugins, and integrations for the
            ecosystem.
          </Typography>
        </Box>
      </Box>
    </Container>
  </Box>
);

/**
 * @todo gradient
 */
const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>HASH</title>
      </Head>
      <Hero />
    </>
  );
};

export default Home;
