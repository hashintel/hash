import { Box } from "@mui/system";
import { ImageProps } from "next/dist/client/legacy/image";
import Image from "next/legacy/image";
import { FunctionComponent, HTMLProps } from "react";

import { useBlogPostPhotos } from "./blog-post";

export const mdxImageClasses = { root: "MdxImage" };

export const MdxImage: FunctionComponent<
  Omit<ImageProps, "src"> & { src: string; style: HTMLProps<HTMLDivElement> }
> = ({ src, width, height, style, ...props }) => {
  const { body } = useBlogPostPhotos();
  const details = body[src];

  // @todo figure out what this should actually be – we don't have details on body for <img> tags
  // we should probably fetch images in img tags instead so that they appear in the body map
  if (!details && (!src || !width || !height)) {
    throw new Error(
      `You must provide a src, width, and height if using a custom img tag.`,
    );
  };

  // Allow loading of images from Cloudflare Images
  // Docs: https://developers.cloudflare.com/images/cloudflare-images/serve-images/serve-images-custom-domains/
  const cloudflareLoader = ({ src }) => {
    return `https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/${src}`
  };

  const inline = typeof width !== "undefined" && typeof height !== "undefined";

  return (
    <Box
      className={mdxImageClasses.root}
      sx={
        inline
          ? {
              display: "inline-flex",

              justifyContent: "center",

              "&:first-child:not(:last-child)": { mr: 2 },
              "&:last-child:not(:first-child)": { ml: 2 },
            }
          : {}
      }
      style={style}
    >
      <Image
        {...props}
        {...details}
        src={`/${src.replace(/^\//, "")}`}
        width={width ?? details?.width}
        height={height ?? details?.height}
        layout={inline ? "intrinsic" : "responsive"}
      />
    </Box>
  );
};
