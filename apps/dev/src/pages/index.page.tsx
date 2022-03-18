import { Container, Stack, Typography, Box, Button } from "@mui/material";
import type { NextPage } from "next";
import Head from "next/head";

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
        <Stack direction="row" alignItems="center">
          <Box>
            <Typography>HASH for Developers</Typography>
            <Typography>Help build the future of decision-making</Typography>
            {/** @todo divider, link */}
            <Typography>
              HASH is an organization building the next generation of
              simulation, decision-making, and knowledge management tools.
            </Typography>
            <Typography>
              Here you’ll find resources for developers who want to use our open
              source projects and build blocks, plugins, and integrations for
              the ecosystem.
            </Typography>
          </Box>
          <Button
            variant="primary"
            size="medium"
            href="https://blockprotocol.org"
          >
            Visit blockprotocol.org
          </Button>
        </Stack>
      </Container>
    </>
  );
};

export default Home;
