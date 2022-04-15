import { Container, Stack, Typography, typographyClasses } from "@mui/material";
import { Box } from "@mui/system";
import Head from "next/head";
import Image from "next/image";
import { createContext, FC, ReactNode, useContext, VFC } from "react";
import { mdxImageClasses } from "./MdxImage";

export type BlogPagePhoto = {
  src: string;
  width: number;
  height: number;
};

export type BlogPagePhotos = {
  author: BlogPagePhoto | null;
  post: BlogPagePhoto | null;
  body: Record<string, BlogPagePhoto | null>;
};

export const BlogPostPhotosContext = createContext<BlogPagePhotos | null>(null);

export const useBlogPostPhotos = () => {
  const context = useContext(BlogPostPhotosContext);

  if (!context) {
    throw new Error("Missing provider");
  }

  return context;
};

export const BlogPostHead: VFC<{
  title: ReactNode;
  subtitle: ReactNode;
  author: ReactNode;
  jobTitle: ReactNode;
  date: ReactNode;
  pageTitle: string;
}> = ({ title, subtitle, author, jobTitle, date, pageTitle }) => {
  const photos = useBlogPostPhotos();
  return (
    <>
      <Head>
        <title>{pageTitle} – HASH for Developers</title>
      </Head>
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
                  {date}
                </Typography>
                <Stack direction="row">
                  {photos.author ? (
                    <Box
                      width={48}
                      height={48}
                      borderRadius={48}
                      overflow="hidden"
                      position="relative"
                    >
                      <Image src={photos.author.src} layout="fill" />
                    </Box>
                  ) : null}
                  <Stack ml={2} direction="column" spacing={0.5}>
                    <Typography variant="hashMediumCaps" color="purple.600">
                      {author}
                    </Typography>
                    <Typography variant="hashMediumCaps">{jobTitle}</Typography>
                  </Stack>
                </Stack>
              </Stack>
            </Box>
            {photos.post ? (
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
                <Image {...photos.post} layout="responsive" />
              </Box>
            ) : null}
          </Stack>
        </Container>
      </Box>
    </>
  );
};

export const BlogPostContent: FC = ({ children }) => (
  <Container>
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr min(calc(var(--step-0) * 37.7), 100%) 1fr",
        margin: "0 auto",

        "> *": {
          gridColumn: 2,
        },

        [`.${typographyClasses.root} a`]: {
          fontWeight: "inherit",
        },

        ".MuiTypography-hashBodyCopy + .MuiTypography-hashBodyCopy": {
          mt: 4,
        },
        ".MuiTypography-hashHeading2": {
          mt: 10,
          mb: 4.25,
          color: "gray.90",
        },
        ".MuiTypography-hashHeading3": {
          mt: 8,
          mb: 3,
          color: "gray.90",
        },
        ".MuiTypography-hashHeading4": {
          mt: 8,
          mb: 2,
          color: "gray.90",
        },
        ".MuiTypography-hashHeading5": {
          mt: 5,
          mb: 2,
          color: "gray.90",
        },
        [`.${mdxImageClasses.root}`]: {
          width: 1,
          gridColumn: "1 / 4",
          my: 5,

          img: {
            borderRadius: "4px",
          },
        },
        "> pre": {
          my: 3,
        },
      }}
    >
      {children}
    </Box>
  </Container>
);
