import { Container, Stack, Typography } from "@mui/material";
import { Box, TypographyProps } from "@mui/system";
import { format } from "date-fns";
import Image from "next/legacy/image";
import { NextSeo } from "next-seo";
import { createContext, FunctionComponent, ReactNode, useContext } from "react";

import { FRONTEND_URL } from "../config";
import { BlogPostAuthor as BlogPostAuthorType } from "../pages/blog/[...blog-slug].page";
import { FaIcon } from "./icons/fa-icon";
import { Link } from "./link";
import { mdxImageClasses } from "./mdx-image";

export type BlogPostPagePhoto = {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
};

export type BlogPagePhotos = {
  post: BlogPostPagePhoto | null;
  body: Record<string, BlogPostPagePhoto | null>;
};

export const BlogPostPhotosContext = createContext<BlogPagePhotos | null>(null);

export const useBlogPostPhotos = () => {
  const context = useContext(BlogPostPhotosContext);

  if (!context) {
    throw new Error("Missing provider");
  }

  return context;
};

export type BlogPostAuthorProps = TypographyProps & {
  children?: ReactNode;
  small?: boolean;
};

export const BlogPostAuthor: FunctionComponent<BlogPostAuthorProps> = ({
  children,
  small = false,
  ...props
}) => (
  <Typography
    variant={small ? "hashSmallCaps" : "hashMediumCaps"}
    color="purple.600"
    {...props}
  >
    {children}
  </Typography>
);

export const BlogPostHead: FunctionComponent<{
  title?: string;
  subtitle?: string;
  authors?: BlogPostAuthorType[];
  date?: string;
  pageTitle?: string;
  pageDescription?: string;
}> = ({
  title,
  subtitle,
  authors = [],
  date: dateInput,
  pageTitle = title,
  pageDescription = subtitle,
}) => {
  const photos = useBlogPostPhotos();

  const fullTitle = `${pageTitle ? `${pageTitle} – ` : ""}HASH Developer Blog`;

  const date = dateInput ? new Date(dateInput) : null;
  const dateIso = date ? date.toISOString() : null;

  return (
    <>
      <NextSeo
        title={fullTitle}
        description={pageDescription}
        {...(photos.post
          ? {
              openGraph: {
                images: [{ url: `${FRONTEND_URL}${photos.post.src}` }],
                type: "article",
                article: {
                  authors: authors.map((author) => author.name),
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- don't want empty string
                  publishedTime: dateIso || undefined,
                },
              },
            }
          : {})}
      />
      <Box pt={8}>
        <Container
          sx={(theme) => ({
            // @todo check these spacings
            mb: { xs: 9.25, md: 15.5 },
            [theme.breakpoints.up("md")]: {
              mx: 0,
              maxWidth: "calc(100vw - ((100vw - var(--size)) / 2)) !important",
              ml: "calc(var(--size) - var(--size)) / 2)",
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
              <Link href="/blog" mb={3} display="block">
                <FaIcon
                  name="arrow-left"
                  type="regular"
                  sx={{
                    width: "0.85rem",
                    height: "0.85rem",
                    marginRight: "8px",
                    color: "orange.700",
                  }}
                />
                <Typography
                  variant="hashSmallCaps"
                  sx={{
                    color: "orange.700",
                    borderBottom: 1,
                    borderBottomColor: "yellow.400",
                    pb: "4px",

                    "&:hover": {
                      color: "orange.900",
                      borderBottomColor: "yellow.700",
                    },
                  }}
                >
                  BACK TO BLOG
                </Typography>
              </Link>
              {title ? (
                <Typography variant="hashHeading1" mb={3}>
                  {title}
                </Typography>
              ) : null}
              {subtitle ? (
                <Typography variant="hashLargeText" mb={5} color="gray.80">
                  {subtitle}
                </Typography>
              ) : null}
              <Stack direction={{ xs: "column", md: "row" }}>
                {date ? (
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
                    {format(date, "MMMM do, y")}
                  </Typography>
                ) : null}
                <Stack spacing={4}>
                  {authors.map((author) => (
                    <Stack direction="row" key={author.name}>
                      {author.photo ? (
                        <Box
                          width={48}
                          height={48}
                          borderRadius={48}
                          overflow="hidden"
                          position="relative"
                        >
                          <Image src={author.photo.src} layout="fill" />
                        </Box>
                      ) : null}
                      <Stack ml={2} direction="column" spacing={0.5}>
                        <BlogPostAuthor>{author.name}</BlogPostAuthor>
                        <Typography variant="hashMediumCaps">
                          {author.jobTitle}
                        </Typography>
                      </Stack>
                    </Stack>
                  ))}
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
                <Image
                  {...photos.post}
                  layout="responsive"
                  placeholder="blur"
                />
              </Box>
            ) : null}
          </Stack>
        </Container>
      </Box>
    </>
  );
};

export const BlogPostContent: FunctionComponent<{ children?: ReactNode }> = ({
  children,
}) => (
  <Container>
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr min(calc(var(--step-0) * 37.7), 100%) 1fr",
        margin: "0 auto",

        "> *": {
          gridColumn: 2,
        },

        [`> .MuiTypography-hashBodyCopy + .MuiTypography-hashBodyCopy, > .MuiTypography-hashBodyCopy + div:not(.${mdxImageClasses.root}), > div:not(.${mdxImageClasses.root}) + .MuiTypography-hashBodyCopy, > div:not(.${mdxImageClasses.root}) + div:not(.${mdxImageClasses.root})`]:
          {
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
        [`> .${mdxImageClasses.root}`]: {
          width: 1,
          gridColumn: "1 / 4",
          my: 5,

          [`+ .${mdxImageClasses.root}`]: {
            mt: 0,
          },
        },
        [`.${mdxImageClasses.root} img`]: {
          borderRadius: "4px",
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
