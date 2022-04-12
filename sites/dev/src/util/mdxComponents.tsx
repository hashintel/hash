import { Box, Typography, TypographyProps } from "@mui/material";
import Image from "next/image";
import { ReactNode, VFC } from "react";
import {
  BlogPostContent,
  BlogPostHead,
  useBlogPostPhotos,
} from "../components/BlogPost";

const MdxImage: VFC<{ src: string; alt?: string; title?: string }> = ({
  src,
  ...props
}) => {
  const { body } = useBlogPostPhotos();
  const details = body[src];

  if (!details?.src) {
    return null;
  }

  return <Image {...props} {...details} layout="responsive" />;
};

export const mdxComponents: Record<string, ReactNode> = {
  Box,
  Typography,
  BlogPostHead,
  BlogPostContent,

  p: (props: TypographyProps<"p">) => <Typography {...props} component="p" />,
  img: MdxImage,
};
