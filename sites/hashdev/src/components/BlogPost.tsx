import { Container, Stack, Typography } from "@mui/material";
import { Box, TypographyProps } from "@mui/system";
import Head from "next/head";
import Image from "next/image";
import { createContext, FC, useContext, VFC } from "react";
import { FRONTEND_URL } from "../config";
import { Link } from "./Link";
import { mdxImageClasses } from "./MdxImage";
import { FaIcon } from "./icons/FaIcon";

/**
 * @param {number} digit
 * @returns the ordinal suffix of the input digit
 */
const nth = (digit: number) => {
  if (digit > 3 && digit < 21) return "th";
  switch (digit % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

/**
 * @param {Date} date
 * @returns the formatted string of the date object (e.g. "May 17th, 2022")
 */
const formatDate = (date: Date) => {
  const year = date.toLocaleString("default", { year: "numeric" });
  const month = date.toLocaleString("default", { month: "long" });
  const day = parseInt(date.toLocaleString("default", { day: "numeric" }), 10);

  return `${month} ${day}${nth(day)}, ${year}`;
};

export type BlogPostPagePhoto = {
  src: string;
  width: number;
  height: number;
};

export type BlogPagePhotos = {
  author: BlogPostPagePhoto | null;
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

export const BlogPostAuthor: FC<TypographyProps & { small?: boolean }> = ({
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

export const BlogPostHead: VFC<{
  title?: string;
  subtitle?: string;
  author?: string;
  jobTitle?: string;
  date?: string;
  pageTitle?: string;
  pageDescription?: string;
}> = ({
  title,
  subtitle,
  author,
  jobTitle,
  date: dateInput,
  pageTitle = title,
  pageDescription = subtitle,
}) => {
  const photos = useBlogPostPhotos();

  const fullTitle = `${pageTitle ? `${pageTitle} – ` : ""}HASH for Developers`;

  const date = dateInput ? new Date(dateInput) : null;
  const dateIso = date ? date.toISOString() : null;

  return (
    <>
      <Head>
        <title>{fullTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:site" content="@hashintel" />
        {photos.post ? (
          <>
            <meta name="twitter:card" content="summary_large_image" />
            <meta
              name="twitter:image:src"
              content={`${FRONTEND_URL}${photos.post.src}`}
            />
            <meta
              property="og:image"
              content={`${FRONTEND_URL}${photos.post.src}`}
            />
          </>
        ) : null}
        <meta name="og:title" content={fullTitle} />
        <meta name="og:description" content={pageDescription} />
        <meta property="og:site_name" content="HASH for Developers" />
        <meta property="og:type" content="article" />
        <meta property="og:article:author" content={author} />
        <meta property="article:author" content={author} />
        {dateIso ? (
          <>
            <meta property="og:article:published_time" content={dateIso} />
            <meta property="article:published_time" content={dateIso} />
          </>
        ) : null}
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
                    {formatDate(date)}
                  </Typography>
                ) : null}
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
                    {author ? <BlogPostAuthor>{author}</BlogPostAuthor> : null}
                    {jobTitle ? (
                      <Typography variant="hashMediumCaps">
                        {jobTitle}
                      </Typography>
                    ) : null}
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
