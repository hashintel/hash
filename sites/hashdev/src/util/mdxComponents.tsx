import { Box, Typography, TypographyProps } from "@mui/material";
import { ReactNode } from "react";
import dynamic from "next/dynamic";

import { ImageWithText } from "../components/ImageWithText";
import { Link, LinkProps } from "../components/Link";
import { MdxImage } from "../components/MdxImage";
import { MdxPre } from "../components/MdxPre";

const CalculationBlock = dynamic(
  () => import("../components/CalculationBlock"),
  { ssr: false },
);

export const mdxComponents: Record<string, ReactNode> = {
  Box,
  Typography,

  p: (props: TypographyProps<"p">) => {
    if (!Array.isArray(props.children) && typeof props.children !== "string") {
      return props.children;
    }
    return <Typography {...props} variant="hashBodyCopy" />;
  },

  a: (props: LinkProps) => <Link {...props} />,

  h1: (props: TypographyProps<"h1">) => (
    <Typography {...props} variant="hashHeading1" />
  ),

  h2: (props: TypographyProps<"h2">) => (
    <Typography {...props} variant="hashHeading2" />
  ),

  h3: (props: TypographyProps<"h3">) => (
    <Typography {...props} variant="hashHeading3" />
  ),

  h4: (props: TypographyProps<"h4">) => (
    <Typography {...props} variant="hashHeading4" />
  ),

  h5: (props: TypographyProps<"h5">) => (
    <Typography {...props} variant="hashHeading5" />
  ),

  CalculationBlock,

  pre: MdxPre,

  img: MdxImage,

  ImageWithText,
};
