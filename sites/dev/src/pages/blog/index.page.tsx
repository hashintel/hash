import { Container, Stack, Typography } from "@mui/material";
import { Box } from "@mui/system";
import { GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import { FC, Fragment, VFC } from "react";
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
      getAllPages<BlogPostProps>("blog").map(async (page) => ({
        ...page,
        photos: page.data.postPhoto
          ? {
              post: await getPhoto(page.data.postPhoto),
            }
          : {},
      })),
    );

    const fakedPages = [
      ...pages,
      ...new Array(11)
        .fill({})
        .flatMap(() => pages)
        .map((page) => ({
          ...page,
          fileName: `${Math.floor(Math.random() * 100)}_${page.fileName}`,
        }))
        .slice(0, 11 - pages.length),
    ];
    return {
      props: {
        pages: fakedPages,
      },
    };
  } catch (err) {
    // @todo better error when MDX content is broken
    return {
      notFound: true,
    };
  }
};

const BlogPostLink: FC<{ page: BlogIndividualPage }> = ({ page, children }) => (
  <Link
    href={{
      pathname: "/blog/[...blogSlug]",
      query: { blogSlug: parseNameFromFileName(page.fileName) },
    }}
  >
    {children}
  </Link>
);

const PostImage: VFC<{ page: BlogIndividualPage }> = ({ page }) =>
  page.photos.post ? (
    <BlogPostLink page={page}>
      <Image {...page.photos.post} />
    </BlogPostLink>
  ) : null;

const MajorPost: VFC<{ page: BlogIndividualPage }> = ({ page }) => (
  <Stack direction="column">
    <Box>
      <PostImage page={page} />
    </Box>
    <Box>
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
    </Box>
  </Stack>
);

const MinorPost: VFC<{ page: BlogIndividualPage; collapsed?: boolean }> = ({
  page,
  collapsed,
}) => (
  <Stack
    direction={{ xs: "column-reverse", ...(!collapsed && { md: "row" }) }}
    spacing={{ xs: 3, ...(!collapsed && { md: 6 }) }}
  >
    <Box>
      {page.data.author ? (
        <BlogPostAuthor>{page.data.author}</BlogPostAuthor>
      ) : null}
      {page.data.title ? (
        <Typography variant="hashHeading4">
          <BlogPostLink page={page}>{page.data.title}</BlogPostLink>
        </Typography>
      ) : null}
      {page.data.subtitle ? (
        <Typography variant="hashBodyCopy" sx={{ lineHeight: 1.5 }}>
          {page.data.subtitle}
        </Typography>
      ) : null}
    </Box>
    <Box>
      <PostImage page={page} />
    </Box>
  </Stack>
);

const MajorRow: VFC<{ reverse?: boolean; posts: BlogIndividualPage[] }> = ({
  reverse,
  posts: [majorPost = null, ...posts],
}) => (
  <Stack
    direction={{ xs: "column", md: reverse ? "row-reverse" : "row" }}
    spacing={{ xs: 8, md: 10 }}
  >
    {majorPost ? (
      <Box width={{ xs: 1, md: 591 }}>
        <MajorPost page={majorPost} />
      </Box>
    ) : null}
    <Stack
      flex={1}
      divider={<Box border={1} borderColor="gray.30" my={4} component="hr" />}
    >
      {posts.map((post) => (
        <MinorPost page={post} key={post.fileName} />
      ))}
    </Stack>
  </Stack>
);

const MinorRow: VFC<{ posts: BlogIndividualPage[] }> = ({ posts }) => (
  <Stack direction={{ xs: "column", md: "row" }} spacing={5}>
    {posts.map((post) => (
      <MinorPost page={post} collapsed key={post.fileName} />
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
      <GradientContainer>
        <Container>
          <Typography mb={2} variant="hashHeading3" color="gray.90">
            HASH Developer Blog
          </Typography>
          <Stack direction="row" alignItems="center" spacing={4} mb={6}>
            <Box>
              <Typography>
                Stories and guides from developers in the community
              </Typography>
            </Box>
            <Box
              component="hr"
              flex={1}
              border={1}
              borderColor="gray.30"
              display={{ xs: "none", md: "initial" }}
            />
          </Stack>
          {/** @todo subscribe box, spacing */}
          <Stack direction="column" spacing={11}>
            {groupedPages.map((row, idx) => (
              // eslint-disable-next-line react/no-array-index-key
              <Fragment key={idx}>
                {idx % 3 === 1 ? (
                  <MinorRow posts={row} />
                ) : (
                  <>
                    <MajorRow posts={row} reverse={idx % 3 === 2} />
                    {/** @todo full width */}
                    {idx === 0 ? <Subscribe /> : null}
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
