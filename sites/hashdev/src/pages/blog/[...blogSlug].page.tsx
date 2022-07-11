import { GetStaticPaths, GetStaticProps, NextPage } from "next";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import {
  BlogPagePhotos,
  BlogPostContent,
  BlogPostHead,
  BlogPostPhotosContext,
} from "../../components/BlogPost";
import { MdxPageContent } from "../../components/MdxPageContent";
import { getAllPageHrefs, getSerializedPage } from "../../util/mdxUtil";
import { getPhoto } from "./shared/get-photo";

export type BlogPostProps = {
  title: string;
  subtitle: string;
  author: string;
  jobTitle: string;
  date: string;
  authorPhoto: string;
  postPhoto: string;
  postPhotoSquare?: string;
};

type BlogPostPageProps = {
  serializedPage: MDXRemoteSerializeResult<Record<string, unknown>>;
  photos: BlogPagePhotos;
  data: Partial<BlogPostProps>;
};

type BlogPostPageQueryParams = {
  blogSlug?: string[];
};

export const getStaticPaths: GetStaticPaths<
  BlogPostPageQueryParams
> = async () => {
  const paths = getAllPageHrefs({ folderName: "blog" }).map((href) => ({
    params: {
      blogSlug: href
        .replace("/blog", "")
        .split("/")
        .filter((item) => !!item),
    },
  }));

  return {
    paths,
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<
  BlogPostPageProps,
  BlogPostPageQueryParams
> = async ({ params }) => {
  const { blogSlug } = params ?? {};

  const fileNameWithoutIndex =
    blogSlug && blogSlug.length > 0 ? blogSlug[0]! : "index";

  // As of Jan 2022, { fallback: false } in getStaticPaths does not prevent Vercel
  // from calling getStaticProps for unknown pages. This causes 500 instead of 404:
  //
  //   Error: ENOENT: no such file or directory, open '{...}/_pages/docs/undefined'
  //
  // Using try / catch prevents 500, but we might not need them in Next v12+.
  try {
    const [serializedPage, data, images] = await getSerializedPage({
      pathToDirectory: "blog",
      fileNameWithoutIndex,
    });

    const authorPhotoSrc: string | null = data?.authorPhoto ?? null;
    const postPhotoSrc: string | null = data?.postPhoto ?? null;

    const [authorPhoto, postPhoto, bodyImages] = await Promise.all([
      getPhoto(authorPhotoSrc),
      getPhoto(postPhotoSrc),

      Promise.all(
        images.map(
          async (image) => [image.url, await getPhoto(image.url)] as const,
        ),
      ).then((pairs) => Object.fromEntries(pairs)),
    ]);

    const photos: BlogPagePhotos = {
      author: authorPhoto,
      post: postPhoto,
      body: bodyImages,
    };

    return {
      props: {
        serializedPage,
        photos,
        data,
      },
    };
  } catch (err) {
    // @todo better error when MDX content is broken
    return {
      notFound: true,
    };
  }
};

const BlogPostPage: NextPage<BlogPostPageProps> = ({
  serializedPage,
  photos,
  data,
}) => {
  return (
    <BlogPostPhotosContext.Provider value={photos}>
      <BlogPostHead
        title={data.title}
        subtitle={data.subtitle}
        author={data.author}
        jobTitle={data.jobTitle}
        date={data.date}
      />
      <BlogPostContent>
        <MdxPageContent serializedPage={serializedPage} />
      </BlogPostContent>
    </BlogPostPhotosContext.Provider>
  );
};

export default BlogPostPage;
