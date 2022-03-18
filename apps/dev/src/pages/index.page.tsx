import { Box, Container, Stack, Typography } from "@mui/material";
import type { NextPage } from "next";
import Head from "next/head";
import { ComponentProps, VFC } from "react";

const HeroDividerBox: VFC<ComponentProps<typeof Box>> = ({
  sx = [],
  ...props
}) => <Box sx={[...(Array.isArray(sx) ? sx : [sx])]} {...props} />;
const HeroDivider: VFC<ComponentProps<typeof Stack>> = (props) => (
  <Stack {...props} direction="row" alignItems="stretch" height={12}>
    <Box width={60} bgcolor="orange.400" />
    <Box width={36} bgcolor="orange.400" sx={{ opacity: 0.5 }} />
    <Box width={24} bgcolor="orange.400" sx={{ opacity: 0.2 }} />
    <Box width={12} bgcolor="orange.400" sx={{ opacity: 0 }} />
    <Box width={12} bgcolor="orange.400" sx={{ opacity: 0.2 }} />
  </Stack>
);

const Hero: VFC = () => (
  <Box width={{ xs: 1, md: 871 }} py={16}>
    <Typography variant="hashHeading4" component="h1" mb={3}>
      HASH for Developers
    </Typography>
    <Typography variant="hashHeading1" component="h2" mb={5}>
      Help build the future of decision-making
    </Typography>
    <HeroDivider mb={5} />
    <Box width={{ xs: 1, md: 550 }}>
      <Typography mb={2}>
        HASH is an organization building the next generation of simulation,
        decision-making, and knowledge management tools.
      </Typography>
      <Typography>
        Here you’ll find resources for developers who want to use our open
        source projects and build blocks, plugins, and integrations for the
        ecosystem.
      </Typography>
    </Box>
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
      <Container>
        <Hero />
      </Container>
    </>
  );
};

export default Home;
