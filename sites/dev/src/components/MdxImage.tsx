import { Box } from "@mui/system";
import { ImageProps } from "next/dist/client/image";
import Image from "next/image";
import { HTMLProps, VFC } from "react";
import { useBlogPostPhotos } from "./BlogPost";

export const mdxImageClasses = { root: "MdxImage" };

export const MdxImage: VFC<
  Omit<ImageProps, "src"> & { src: string; style: HTMLProps<HTMLDivElement> }
> = ({ src, width, height, style, ...props }) => {
  const { body } = useBlogPostPhotos();
  const details = body[src];

  if (!details?.src) {
    return null;
  }

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
        width={width ?? details.width}
        height={height ?? details.height}
        layout={inline ? "intrinsic" : "responsive"}
      />
    </Box>
  );
};
