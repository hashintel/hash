import { Avatar, Container, Stack, Typography } from "@mui/material";
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
              <Stack
                direction="row"
                alignItems="center"
                sx={{ fontSize: "var(--step--2)" }}
              >
                <Avatar>CK</Avatar>
                <Stack ml={2} direction="column" flex={1} spacing={0.5}>
                  <Typography variant="hashMediumCaps" color="purple.600">
                    Chris Kingle
                  </Typography>
                  <Stack direction="row" alignItems="center">
                    <Typography variant="hashMediumCaps">
                      Platform Engineer at HASH
                    </Typography>
                    <Typography
                      ml="auto"
                      variant="hashSmallText"
                      fontStyle="italic"
                      color="gray.80"
                    >
                      January 24th, 2022
                    </Typography>
                  </Stack>
                </Stack>
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
