import { GetStaticPaths, GetStaticProps, NextPage } from "next";
import { MDXRemoteSerializeResult } from "next-mdx-remote";

import {
  BlogPagePhotos,
  BlogPostContent,
  BlogPostHead,
  BlogPostPagePhoto,
  BlogPostPhotosContext,
} from "../../components/blog-post";
import { MdxPageContent } from "../../components/mdx-page-content";
import { getAllPageHrefs, getSerializedPage } from "../../util/mdx-util";
import { getPhoto } from "./shared/get-photo";

type BlogPostAuthorWithPhotoSrc = {
  name: string;
  jobTitle: string;
  photo: string;
};

export type BlogPostProps = {
  title: string;
  subtitle: string;
  authors: BlogPostAuthorWithPhotoSrc[];
  date: string;
  postPhoto: string;
  postPhotoSquare?: string;
};

export type BlogPostAuthor = {
  name: string;
  jobTitle: string;
  photo: BlogPostPagePhoto | null;
};

type BlogPostPageProps = {
  serializedPage: MDXRemoteSerializeResult<Record<string, unknown>>;
  photos: BlogPagePhotos;
  data: Partial<Omit<BlogPostProps, "authors"> & { authors: BlogPostAuthor[] }>;
};

type BlogPostPageQueryParams = {
  "blog-slug"?: string[];
};

// Allow loading of images from Cloudflare Images
// Docs: https://developers.cloudflare.com/images/cloudflare-images/serve-images/serve-images-custom-domains/
const cloudflareLoader = ({ src }) => {
  return `https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/${src}`
};

export const getStaticPaths: GetStaticPaths<BlogPostPageQueryParams> = () => {
  const paths = getAllPageHrefs({ folderName: "blog" }).map((href) => ({
    params: {
      "blog-slug": href
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
  const blogSlug = params?.["blog-slug"];

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

    const postPhotoSrc: string | null =
      (typeof data.postPhoto === "string" &&
        data.postPhoto &&
        data.postPhoto.split(",")[0]) ||
      null;
    const [postPhoto, bodyImages] = await Promise.all([
      getPhoto(postPhotoSrc),

      Promise.all(
        images.map(
          async (image) => [image.url, await getPhoto(image.url)] as const,
        ),
      ).then((pairs) => Object.fromEntries(pairs)),
    ]);

    const photos: BlogPagePhotos = {
      post: postPhoto,
      body: bodyImages,
    };

    const authors: BlogPostAuthor[] = await Promise.all(
      (data.authors as BlogPostProps["authors"]).map(async (author) => ({
        ...author,
        photo: await getPhoto(author.photo),
      })),
    );

    return {
      props: {
        serializedPage,
        photos,
        data: {
          ...data,
          authors,
        },
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
        authors={data.authors}
        date={data.date}
      />
      <BlogPostContent>
        <MdxPageContent serializedPage={serializedPage} />
      </BlogPostContent>
    </BlogPostPhotosContext.Provider>
  );
};

export default BlogPostPage;
