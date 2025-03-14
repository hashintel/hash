import type { StackProps } from "@mui/material";
import { Container, Divider, Stack, Typography } from "@mui/material";
import { Box } from "@mui/system";
import type { GetStaticProps } from "next";
import Image from "next/legacy/image";
import { NextSeo } from "next-seo";
import type { ComponentProps, FunctionComponent } from "react";
import { Fragment } from "react";

import { BlogPostAuthor } from "../../components/blog-post";
import { ArrowUpRightFromSquareRegularIcon } from "../../components/icons/arrow-up-right-from-square-regular-icon";
import { Link } from "../../components/link";
import { PageLayout } from "../../components/page-layout";
import { Subscribe } from "../../components/pre-footer";
import { parseNameFromFileName } from "../../util/client-mdx-util";
import { getAllPages } from "../../util/mdx-util";
import type { NextPageWithLayout } from "../../util/next-types";
import type { BlogIndividualPage } from "../shared/blog-posts-context";
import type {
  BlogPost,
  BlogPostAuthorWithPhotoSrc,
} from "./[...blog-slug].page";
import { generateFeeds } from "./index.page/generate-feeds";
import { getPhoto } from "./shared/get-photo";

type BlogPageListProps = {
  pages: BlogIndividualPage[];
};

export const getStaticProps: GetStaticProps<BlogPageListProps> = async () => {
  // As of Jan 2022, { fallback: false } in getStaticPaths does not prevent Vercel
  // from calling getStaticProps for unknown pages. This causes 500 instead of 404:
  //
  //   Error: ENOENT: no such file or directory, open '{...}/_pages/docs/undefined'
  //
  // Using try / catch prevents 500, but we might not need them in Next v12+.
  try {
    const pages = await Promise.all(
      getAllPages<BlogPost>("blog")
        .sort((pageA, pageB) => {
          const timeA = pageB.data.dateFirstPublished
            ? new Date(pageB.data.dateFirstPublished).getTime()
            : 0;

          const timeB = pageA.data.dateFirstPublished
            ? new Date(pageA.data.dateFirstPublished).getTime()
            : 0;

          return timeA - timeB;
        })
        .map(async (page) => ({
          ...page,
          photos: {
            post: page.data.postPhoto
              ? await getPhoto(page.data.postPhoto)
              : null,
            postSquare: page.data.postPhotoSquare
              ? await getPhoto(page.data.postPhotoSquare)
              : null,
          },
        })),
    );

    await generateFeeds(pages);

    return {
      props: {
        pages,
      },
    };
  } catch {
    // @todo better error when MDX content is broken
    return {
      notFound: true,
    };
  }
};

const BlogPostLink: FunctionComponent<
  { page: BlogIndividualPage } & Omit<ComponentProps<typeof Link>, "href">
> = ({ page, children, ...props }) => (
  <Link
    {...props}
    href={{
      pathname: "/blog/[...blog-slug]",
      query: { "blog-slug": parseNameFromFileName(page.fileName) },
    }}
  >
    {children}
  </Link>
);

const PostCopyContainer: FunctionComponent<StackProps> = ({
  children,
  ...props
}) => (
  <Stack {...props} direction="column" spacing={{ xs: 1, md: 2 }}>
    {children}
  </Stack>
);

const PostImage: FunctionComponent<{
  page: BlogIndividualPage;
  fill?: boolean;
  square?: boolean;
}> = ({ page, fill = true, square = false }) =>
  page.photos.post ? (
    <BlogPostLink page={page} sx={{ img: { borderRadius: "4px" } }}>
      <Image
        {...((square ? page.photos.postSquare : null) ?? page.photos.post)}
        placeholder="blur"
        layout="responsive"
        {...(fill && {
          layout: "fill",
          objectFit: "cover",
          objectPosition: "center",
        })}
      />
    </BlogPostLink>
  ) : null;

const BigPost: FunctionComponent<{ page: BlogIndividualPage }> = ({ page }) => (
  <Stack direction="column" spacing={{ xs: 3, md: 4 }}>
    <Box position="relative">
      <PostImage page={page} fill={false} />
    </Box>
    <PostCopyContainer>
      <BlogPostAuthor>
        {page.data.authors.map((author) => author.name).join(" & ")}
      </BlogPostAuthor>
      <Typography variant="hashHeading2">
        <BlogPostLink page={page}>{page.data.title}</BlogPostLink>
      </Typography>
      <Typography variant="hashBodyCopy" sx={{ lineHeight: 1.5 }}>
        {page.data.subtitle}
      </Typography>
    </PostCopyContainer>
  </Stack>
);

const formatAuthorsName = (authors: BlogPostAuthorWithPhotoSrc[]): string => {
  const authorNames = authors.map((author) => author.name);
  const formattedAuthorsName =
    authorNames.length > 1
      ? authorNames
          .slice(0, -1)
          .join(", ")
          .concat(` & ${authorNames.slice(-1)}`)
      : authorNames.join(" & ");
  return formattedAuthorsName;
};

const Post: FunctionComponent<{
  post: BlogIndividualPage;
  collapsed?: boolean;
  displayPhoto?: boolean;
}> = ({ post, collapsed = false, displayPhoto = true }) => (
  <Stack
    direction={{ xs: "column-reverse", ...(!collapsed && { md: "row" }) }}
    spacing={{ xs: 3, ...(!collapsed && { md: 6 }) }}
    alignItems={{ xs: "center", md: "flex-start" }}
    flex={1}
  >
    <PostCopyContainer
      flex={1}
      alignItems={{ xs: "center", md: "flex-start" }}
      textAlign={{ xs: "center", md: "left" }}
    >
      <BlogPostAuthor small>
        {formatAuthorsName(post.data.authors)}
      </BlogPostAuthor>
      <Typography variant="hashHeading4" color="gray.90">
        <BlogPostLink page={post}>{post.data.title}</BlogPostLink>
      </Typography>
      <Typography
        variant="hashSmallText"
        color="gray.80"
        sx={{ lineHeight: 1.5 }}
      >
        {post.data.subtitle}
      </Typography>
    </PostCopyContainer>
    {displayPhoto ? (
      <Box
        sx={[
          { position: "relative" },
          !collapsed && { width: 160, height: 160 },
          collapsed && { width: 1 },
        ]}
      >
        <PostImage square={!collapsed} page={post} fill={!collapsed} />
      </Box>
    ) : null}
  </Stack>
);

const FourPostsRow: FunctionComponent<{
  reverse?: boolean;
  posts: BlogIndividualPage[];
  displayPhotos: boolean;
}> = ({ reverse, posts: [majorPost = null, ...posts], displayPhotos }) => (
  <Stack
    direction={{ xs: "column", md: reverse ? "row-reverse" : "row" }}
    spacing={{ xs: 8, md: 10 }}
  >
    {majorPost ? (
      <Box width={{ xs: 1, md: 591 }}>
        <BigPost page={majorPost} />
      </Box>
    ) : null}
    <Stack
      flex={1}
      divider={
        <Box
          border={0}
          borderTop={1}
          borderColor="gray.30"
          my={4}
          component="hr"
          width={1}
        />
      }
    >
      {posts.map((post) => (
        <Post post={post} key={post.fileName} displayPhoto={displayPhotos} />
      ))}
    </Stack>
  </Stack>
);

const ThreePostsRow: FunctionComponent<{ posts: BlogIndividualPage[] }> = ({
  posts,
}) => (
  <Stack direction={{ xs: "column", md: "row" }} spacing={5}>
    {posts.map((post) => (
      <Post post={post} collapsed key={post.fileName} />
    ))}
  </Stack>
);

const BlogPage: NextPageWithLayout<BlogPageListProps> = ({ pages }) => {
  const groupedPages = pages.reduce<BlogIndividualPage[][]>(
    (groups, page, idx) => {
      const cappedIdx = idx % 11;

      if ([0, 4, 7].includes(cappedIdx)) {
        groups.push([]);
      }

      groups[groups.length - 1]!.push(page);

      return groups;
    },
    [],
  );

  return (
    <>
      <NextSeo title="HASH Developer Blog" />
      <Container>
        <Stack direction="row" justifyContent="space-between">
          <Typography
            mb={2}
            variant="hashHeading3"
            color="gray.90"
            fontWeight={600}
            component="h1"
          >
            HASH Developer Blog
          </Typography>
          <Stack
            direction="column"
            sx={{
              position: "relative",
              top: 5,
              display: { xs: "none", md: "block" },
            }}
          >
            <Link
              href="https://hash.ai/blog"
              openInNew
              sx={{
                "&:hover .MuiTypography-hashSmallText": {
                  opacity: 0.8,
                  transition: "opacity 0.2s",
                },
              }}
            >
              <Typography
                variant="hashBodyCopy"
                fontWeight={700}
                color="blue.100"
              >
                Looking for our main blog?
              </Typography>

              <Typography
                variant="hashSmallText"
                color="blue.100"
                component="span"
                sx={{
                  opacity: 0.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                }}
              >
                Visit
                <Typography
                  component="span"
                  fontWeight={700}
                  color="blue.100"
                  variant="hashSmallText"
                  ml={0.5}
                  mr={0.8}
                >
                  hash.ai/blog
                </Typography>
                <ArrowUpRightFromSquareRegularIcon
                  sx={{
                    height: "0.8rem",
                    width: "0.8rem",
                  }}
                />
              </Typography>
            </Link>
          </Stack>
        </Stack>
        <Stack
          direction="row"
          alignItems="center"
          spacing={4}
          mb={{ xs: 4, md: 6 }}
        >
          <Box>
            <Typography color="gray.70">
              Stories and guides from developers in the community
            </Typography>
          </Box>
          <Divider
            sx={{
              flex: 1,
              display: { xs: "none", md: "initial" },
            }}
          />
        </Stack>
        {/** @todo subscribe box, spacing */}
        <Stack direction="column" spacing={11}>
          {groupedPages.map((row, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <Fragment key={idx}>
              {idx % 2 === 1 ? (
                <ThreePostsRow posts={row} />
              ) : (
                <>
                  <FourPostsRow
                    posts={row}
                    reverse={idx % 3 === 2}
                    displayPhotos={idx === 0}
                  />
                  {/** @todo full width */}
                  {idx === 0 ? (
                    <Box>
                      <Subscribe />
                    </Box>
                  ) : null}
                </>
              )}
            </Fragment>
          ))}
        </Stack>
      </Container>
    </>
  );
};

BlogPage.getLayout = (page) => (
  <PageLayout subscribe={false}>{page}</PageLayout>
);

export default BlogPage;
