import { Container, Stack, Typography } from "@mui/material";
import type { TypographyProps } from "@mui/system";
import { Box } from "@mui/system";
import { format } from "date-fns";
import Image from "next/legacy/image";
import { NextSeo } from "next-seo";
import type { FunctionComponent, ReactNode } from "react";
import { createContext, useContext } from "react";

import { FRONTEND_URL } from "../config";
import type { BlogPostAuthor as BlogPostAuthorType } from "../pages/blog/[...blog-slug].page";
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

export const useOptionalBlogPostPhotos = () => {
  const context = useContext(BlogPostPhotosContext);

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
    sx={{ color: ({ palette }) => palette.teal[60] }}
    {...props}
  >
    {children}
  </Typography>
);

export const BlogPostHead: FunctionComponent<{
  title?: string;
  subtitle?: string;
  categories?: string[];
  authors?: BlogPostAuthorType[];
  date?: string;
  pageTitle?: string;
  pageDescription?: string;
}> = ({
  title,
  subtitle,
  categories,
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
            <Box display="flex" columnGap={1} marginBottom={3}>
              <Link href="/blog" sx={{ lineHeight: 1 }}>
                <Typography
                  variant="hashSmallCaps"
                  sx={{
                    color: ({ palette }) => palette.teal[70],
                    borderBottom: 1,
                    borderBottomColor: ({ palette }) => palette.teal[40],
                    pb: "4px",
                    transition: ({ transitions }) =>
                      transitions.create(["color", "border-bottom-color"]),
                    "&:hover": {
                      color: ({ palette }) => palette.teal[90],
                      borderBottomColor: ({ palette }) => palette.teal[70],
                    },
                  }}
                >
                  Back to blog
                </Typography>
              </Link>
              {categories && (
                <>
                  <Typography
                    variant="hashSmallText"
                    sx={{ color: ({ palette }) => palette.gray[40] }}
                  >
                    /
                  </Typography>
                  {categories.map((category) => (
                    <Typography
                      key={category}
                      variant="hashSmallText"
                      sx={{
                        color: ({ palette }) => palette.gray[70],
                        fontWeight: 500,
                      }}
                    >
                      {category}
                    </Typography>
                  ))}
                </>
              )}
            </Box>
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
                        <Image
                          {...author.photo}
                          layout="fill"
                          placeholder="blur"
                        />
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
              <Image {...photos.post} layout="responsive" placeholder="blur" />
            </Box>
          ) : null}
        </Stack>
      </Container>
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
        gridTemplateColumns: "1fr min(810px, 100%) 1fr",
        margin: "auto",
        overflow: "auto",
        paddingBottom: 2,

        "> *": {
          gridColumn: 2,
        },

        "ul, ol": {
          marginTop: 1,
          marginBottom: 2,
          "li:not(:last-child)": {
            marginBottom: 1.5,
          },
        },

        [`> .MuiTypography-hashBodyCopy`]: {
          mb: 0,
        },
        [`> .MuiTypography-hashBodyCopy + .MuiTypography-hashBodyCopy, > .MuiTypography-hashBodyCopy + div:not(.${mdxImageClasses.root}), > div:not(.${mdxImageClasses.root}) + .MuiTypography-hashBodyCopy, > div:not(.${mdxImageClasses.root}) + div:not(.${mdxImageClasses.root})`]:
          {
            mt: 3,
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
        /** Headers that come after headers shouldn't have a top margin */
        "& h2 + h3, h2 + h4, h2 + h5, h2 + h6, h3 + h4, h3 + h5, h3 + h6, h4 + h5, h4 + h6, h5 + h6":
          {
            marginTop: 0,
          },
        "& > h1:first-of-type": {
          marginTop: 0,
        },
        "> figure": {
          marginTop: 3,
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
