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
        {/** @todo check these spacings */}
        <Box position="relative" mb={{ xs: 9.25, md: 15.5 }}>
          <Container>
            <Box
              sx={[
                {
                  background: "black",
                  aspectRatio: "654 / 445",
                  width: "100%",
                  position: "relative",
                  borderRadius: 4,
                  overflow: "hidden",
                },
                (theme) => ({
                  [theme.breakpoints.up("md")]: {
                    borderRadius: "4px 0 0 4px",
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    right: 0,
                    width: "45vw",
                    maxHeight: "100%",
                  },
                  [theme.breakpoints.down("md")]: {
                    mb: 3,
                  },
                }),
              ]}
            >
              <Image src="/temp.png" layout="fill" />
            </Box>
            <Box width={{ xs: 1, md: "49.25%" }}>
              <Typography variant="hashHeading1" mb={3}>
                Holding down the fort: security and permissioning in block-based
                systems
              </Typography>
              <Typography variant="hashLargeText" mb={5} color="gray.80">
                Chocolate sugar plum brownie cupcake chocolate bar toffee
                brownie cake. Chocolate sugar plum brownie cupcake.
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }}>
                <Typography
                  variant="hashSmallText"
                  fontStyle="italic"
                  color="gray.80"
                  order={{ xs: 0, md: 1 }}
                  sx={[
                    {
                      order: 0,
                    },
                    (theme) => ({
                      [theme.breakpoints.down("md")]: {
                        mb: 3,
                      },
                      [theme.breakpoints.up("md")]: {
                        order: 1,
                        ml: "auto",
                        alignSelf: "end",
                      },
                    }),
                  ]}
                >
                  January 24th, 2022
                </Typography>
                <Stack direction="row">
                  <Avatar>CK</Avatar>
                  <Stack ml={2} direction="column" spacing={0.5}>
                    <Typography variant="hashMediumCaps" color="purple.600">
                      Chris Kingle
                    </Typography>
                    <Typography variant="hashMediumCaps">
                      Platform Engineer at HASH
                    </Typography>
                  </Stack>
                </Stack>
              </Stack>
            </Box>
          </Container>
        </Box>
      </Box>
      <Container>
        <Typography component="p">
          The computer only knows you've added a bunch of &lt;p&gt; tags to a
          page, but doesn't understand the contents or shape of what you've
          written inside (at least without any fancy natural language
          processing).
        </Typography>
      </Container>
    </>
  );
};

export default BlogPostPage;
