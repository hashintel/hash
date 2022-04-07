import { Container, Stack, Typography } from "@mui/material";
import { Box } from "@mui/system";
import { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";

const BlogPostPage: NextPage = () => {
  return (
    <>
      <Head>
        {/** @todo check this */}
        <title>Holding down the fort – HASH for Developers</title>
      </Head>
      <Box pt={8}>
        <Box position="relative">
          <Container>
            <Box width="49.25%">
              <Typography variant="hashHeading1" mb={3}>
                Holding down the fort: security and permissioning in block-based
                systems
              </Typography>
              <Typography variant="hashLargeText" mb={5} color="gray.80">
                Chocolate sugar plum brownie cupcake chocolate bar toffee
                brownie cake. Chocolate sugar plum brownie cupcake.
              </Typography>
              <Stack direction="row">
                <Box>Test</Box>
                <Box>Test</Box>
              </Stack>
            </Box>
          </Container>
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              right: 0,
              width: "45%",
              maxHeight: "100%",
              background: "black",
              aspectRatio: "654 / 445",
              borderRadius: 4,
            }}
          >
            <Image src="/temp.png" layout="fill" />
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default BlogPostPage;
