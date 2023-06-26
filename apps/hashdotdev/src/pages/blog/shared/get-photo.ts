import { promisify } from "node:util";

import { imageSize as legacyImageSize } from "image-size";
import { getPlaiceholder } from "plaiceholder";

import { BlogPostPagePhoto } from "../../../components/blog-post";

const imageSize = promisify(legacyImageSize);

export const getPhoto = async (
  src: string | null,
): Promise<BlogPostPagePhoto | null> => {
  if (!src) {
    return null;
  }
  const fullUrl = `/public/${src}`;
  // @todo this is relative to CLI dir – need to make it absolute
  const size = await imageSize(`.${fullUrl}`);

  if (!size || size.width === undefined || size.height === undefined) {
    return null;
  }

  const { base64 } = await getPlaiceholder(`/${src}`);

  return {
    src: `/${src}`,
    height: size.height,
    width: size.width,
    blurDataURL: base64,
  };
};
