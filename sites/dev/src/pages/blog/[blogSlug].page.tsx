import { Container, Stack, Typography } from "@mui/material";
import { Box } from "@mui/system";
import { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import { ReactNode, VFC } from "react";
import postAvatar from "../../../public/david.png";
import postImage from "../../../public/temp.png";

const PostHead: VFC<{ title: ReactNode; subtitle: ReactNode }> = ({
  title,
  subtitle,
}) => (
  <Box pt={8}>
    <Container
      sx={(theme) => ({
        // @todo check these spacings
        mb: { xs: 9.25, md: 15.5 },
        [theme.breakpoints.up("md")]: {
          mx: 0,
          maxWidth: "calc(100vw - ((100vw - var(--size)) / 2)) !important",
          ml: "calc((100vw - var(--size)) / 2)",
          pr: "0px !important",
        },
      })}
    >
      <Stack direction={{ xs: "column", md: "row" }} alignItems="center">
        <Box
          sx={(theme) => ({
            [theme.breakpoints.up("md")]: {
              width: "calc(var(--size) * 0.4925)",
              pr: 0,
              mr: theme.spacing(9.625),
            },
          })}
        >
          <Typography variant="hashHeading1" mb={3}>
            {title}
          </Typography>
          <Typography variant="hashLargeText" mb={5} color="gray.80">
            {subtitle}
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
              <Box
                width={48}
                height={48}
                borderRadius={48}
                overflow="hidden"
                position="relative"
              >
                <Image src={postAvatar} layout="fill" />
              </Box>
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
        <Box
          flex={1}
          position="relative"
          borderRadius={{
            xs: "4px",
            md: "4px 0 0 4px",
          }}
          overflow="hidden"
          order={{ xs: -1, md: 1 }}
          width={{ xs: 1, md: "auto" }}
          mb={{ xs: 3, md: 0 }}
        >
          <Image src={postImage} layout="responsive" />
        </Box>
      </Stack>
    </Container>
  </Box>
);

// @todo semantics
const BlogPostPage: NextPage = () => {
  return (
    <>
      <Head>
        {/** @todo check this */}
        <title>Holding down the fort – HASH for Developers</title>
      </Head>
      <PostHead
        title={
          <>
            Holding down the fort: security and permissioning in block-based
            systems
          </>
        }
        subtitle={
          <>
            Chocolate sugar plum brownie cupcake chocolate bar toffee brownie
            cake. Chocolate sugar plum brownie cupcake.
          </>
        }
      />
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
