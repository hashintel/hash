import { Container, Stack, Typography } from "@mui/material";
import { Box } from "@mui/system";
import { NextPage } from "next";
import Head from "next/head";

const BlogPostPage: NextPage = () => {
  return (
    <>
      <Head>
        {/** @todo check this */}
        <title>Holding down the fort – HASH for Developers</title>
      </Head>
      <Box pt={8}>
        <Container>
          <Box width="49.25%">
            <Typography variant="hashHeading1" mb={3}>
              Holding down the fort: security and permissioning in block-based
              systems
            </Typography>
            <Typography variant="hashLargeText" mb={5}>
              Chocolate sugar plum brownie cupcake chocolate bar toffee brownie
              cake. Chocolate sugar plum brownie cupcake.
            </Typography>
            <Stack direction="horizontal">
              <Box>Test</Box>
              <Box>Test</Box>
            </Stack>
          </Box>
        </Container>
      </Box>
    </>
  );
};

export default BlogPostPage;
