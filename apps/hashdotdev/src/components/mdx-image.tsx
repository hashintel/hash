import { Box } from "@mui/system";
import { ImageProps } from "next/dist/client/legacy/image";
import Image from "next/legacy/image";
import { FunctionComponent, HTMLProps } from "react";

import { useOptionalBlogPostPhotos } from "./blog-post";

export const mdxImageClasses = { root: "MdxImage" };

export const MdxImage: FunctionComponent<
  Omit<ImageProps, "src"> & { src: string; style: HTMLProps<HTMLDivElement> }
> = ({ src, style, blurDataURL, ...props }) => {
  /**
   * @todo: we may also want to make this context available on the `/docs` pages
   */
  const blogPostPhotos = useOptionalBlogPostPhotos();

  const details = blogPostPhotos?.body[src];

  const inline =
    typeof props.width !== "undefined" && typeof props.height !== "undefined";

  const width = props.width ?? details?.width;
  const height = props.height ?? details?.height;

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
      {!width || !height ? (
        <Box
          sx={{
            maxWidth: "100%",
          }}
          component="img"
          src={src}
          alt={props.alt}
        />
      ) : (
        <Image
          {...props}
          {...details}
          src={src.startsWith("https:") ? src : `/${src.replace(/^\//, "")}`}
          width={width}
          height={height}
          layout={inline ? "intrinsic" : "responsive"}
          {...(blurDataURL ? { blurDataURL, placeholder: "blur" } : {})}
        />
      )}
    </Box>
  );
};
