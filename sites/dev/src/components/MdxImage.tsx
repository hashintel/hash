import { Box } from "@mui/system";
import Image from "next/image";
import { VFC } from "react";
import { useBlogPostPhotos } from "./BlogPost";

export const mdxImageClasses = { root: "MdxImage" };

export const MdxImage: VFC<{ src: string; alt?: string; title?: string }> = ({
  src,
  ...props
}) => {
  const { body } = useBlogPostPhotos();
  const details = body[src];

  if (!details?.src) {
    return null;
  }

  return (
    <Box className={mdxImageClasses.root}>
      <Image {...props} {...details} layout="responsive" />
    </Box>
  );
};
