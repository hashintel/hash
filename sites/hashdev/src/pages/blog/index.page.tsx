import {
  Container,
  Divider,
  Stack,
  StackProps,
  Typography,
} from "@mui/material";
import { Box } from "@mui/system";
import { GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import { ComponentProps, FC, Fragment, VFC } from "react";
import { BlogPostAuthor, BlogPostPagePhoto } from "../../components/BlogPost";
import { GradientContainer } from "../../components/GradientContainer";
import { Link } from "../../components/Link";
import { PageLayout } from "../../components/PageLayout";
import { Subscribe } from "../../components/PreFooter";
import { parseNameFromFileName } from "../../util/clientMdxUtil";
import { getAllPages, Page } from "../../util/mdxUtil";
import { NextPageWithLayout } from "../../util/nextTypes";
import { BlogPostProps, getPhoto } from "./[...blogSlug].page";

type BlogIndividualPage = Page<BlogPostProps> & {
  photos: {
    post?: BlogPostPagePhoto | null;
    postSquare?: BlogPostPagePhoto | null;
  };
};

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
      getAllPages<BlogPostProps>("blog")
        .sort((pageA, pageB) => {
          const timeA = pageB.data.date
            ? new Date(pageB.data.date).getTime()
            : 0;

          const timeB = pageA.data.date
            ? new Date(pageA.data.date).getTime()
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

    return {
      props: {
        pages,
      },
    };
  } catch (err) {
    // @todo better error when MDX content is broken
    return {
      notFound: true,
    };
  }
};

const BlogPostLink: FC<
  { page: BlogIndividualPage } & Omit<ComponentProps<typeof Link>, "href">
> = ({ page, children, ...props }) => (
  <Link
    {...props}
    href={{
      pathname: "/blog/[...blogSlug]",
      query: { blogSlug: parseNameFromFileName(page.fileName) },
    }}
  >
    {children}
  </Link>
);

const PostCopyContainer: FC<StackProps> = ({ children, ...props }) => (
  <Stack {...props} direction="column" spacing={{ xs: 1, md: 2 }}>
    {children}
  </Stack>
);

const PostImage: VFC<{
  page: BlogIndividualPage;
  fill?: boolean;
  square?: boolean;
}> = ({ page, fill = true, square = false }) =>
  page.photos.post ? (
    <BlogPostLink page={page} sx={{ img: { borderRadius: "4px" } }}>
      <Image
        {...((square ? page.photos.postSquare : null) ?? page.photos.post)}
        layout="responsive"
        {...(fill && {
          layout: "fill",
          objectFit: "cover",
          objectPosition: "center",
        })}
      />
    </BlogPostLink>
  ) : null;

const BigPost: VFC<{ page: BlogIndividualPage }> = ({ page }) => (
  <Stack direction="column" spacing={{ xs: 3, md: 4 }}>
    <Box position="relative">
      <PostImage page={page} fill={false} />
    </Box>
    <PostCopyContainer>
      {page.data.author ? (
        <BlogPostAuthor>{page.data.author}</BlogPostAuthor>
      ) : null}
      {page.data.title ? (
        <Typography variant="hashHeading2">
          <BlogPostLink page={page}>{page.data.title}</BlogPostLink>
        </Typography>
      ) : null}
      {page.data.subtitle ? (
        <Typography variant="hashBodyCopy" sx={{ lineHeight: 1.5 }}>
          {page.data.subtitle}
        </Typography>
      ) : null}
    </PostCopyContainer>
  </Stack>
);

const Post: VFC<{
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
      {post.data.author ? (
        <BlogPostAuthor small>{post.data.author}</BlogPostAuthor>
      ) : null}
      {post.data.title ? (
        <Typography variant="hashHeading4" color="gray.90">
          <BlogPostLink page={post}>{post.data.title}</BlogPostLink>
        </Typography>
      ) : null}
      {post.data.subtitle ? (
        <Typography
          variant="hashSmallText"
          color="gray.80"
          sx={{ lineHeight: 1.5 }}
        >
          {post.data.subtitle}
        </Typography>
      ) : null}
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

const FourPostsRow: VFC<{
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

const ThreePostsRow: VFC<{ posts: BlogIndividualPage[] }> = ({ posts }) => (
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
    // @todo lighter gradient
    <>
      <Head>
        <title>HASH Developer Blog</title>
      </Head>
      <GradientContainer py={{ xs: 9, md: 13 }}>
        <Container>
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
      </GradientContainer>
    </>
  );
};

BlogPage.getLayout = (page) => (
  <PageLayout subscribe={false}>{page}</PageLayout>
);

export default BlogPage;
