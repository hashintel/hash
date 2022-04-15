import { imageSize as legacyImageSize } from "image-size";
import { GetStaticPaths, GetStaticProps, NextPage } from "next";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import { promisify } from "util";
import {
  BlogPagePhoto,
  BlogPagePhotos,
  BlogPostPhotosContext,
} from "../../components/BlogPost";
import { MdxPageContent } from "../../components/MdxPageContent";
import { getAllPageHrefs, getSerializedPage } from "../../util/mdxUtil";

const imageSize = promisify(legacyImageSize);

type BlogPageProps = {
  serializedPage: MDXRemoteSerializeResult<Record<string, unknown>>;
  photos: BlogPagePhotos;
};

type BlogPageQueryParams = {
  blogSlug?: string[];
};

export const getStaticPaths: GetStaticPaths<BlogPageQueryParams> = async () => {
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

const getPhoto = async (src: string | null): Promise<BlogPagePhoto | null> => {
  if (!src) return null;
  const fullUrl = `/public/${src}`;
  // @todo this is relative to CLI dir – need to make it absolute
  const size = await imageSize(`.${fullUrl}`);

  if (!size || size.width === undefined || size.height === undefined) {
    return null;
  }

  return { src: `/${src}`, height: size.height, width: size.width };
};

export const getStaticProps: GetStaticProps<
  BlogPageProps,
  BlogPageQueryParams
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
      },
    };
  } catch (err) {
    // @todo better error when MDX content is broken
    return {
      notFound: true,
    };
  }
};

// @todo semantics
const BlogPostPage: NextPage<BlogPageProps> = ({ serializedPage, photos }) => {
  return (
    <BlogPostPhotosContext.Provider value={photos}>
      <MdxPageContent serializedPage={serializedPage} />
    </BlogPostPhotosContext.Provider>
  );
};

export default BlogPostPage;
