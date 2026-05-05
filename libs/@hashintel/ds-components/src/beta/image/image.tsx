import { styled } from "@hashintel/ds-helpers/jsx";
import type {
  HTMLStyledProps,
  SystemStyleObject,
} from "@hashintel/ds-helpers/types";
import { forwardRef } from "react";

interface ImageOptions {
  /**
   * How the image to fit within its bounds.
   * It maps to css `object-fit` property.
   * @type SystemStyleObject["objectFit"]
   */
  fit?: SystemStyleObject["objectFit"] | undefined;
  /**
   * How to align the image within its bounds.
   * It maps to css `object-position` property.
   * @type SystemStyleObject["objectPosition"]
   */
  align?: SystemStyleObject["objectPosition"] | undefined;
}

export interface ImageProps extends HTMLStyledProps<"img">, ImageOptions {}

const StyledImage = styled("img");

export const Image = forwardRef<HTMLImageElement, ImageProps>((props, ref) => {
  const { align, fit = "cover", ...rest } = props;
  return (
    <StyledImage ref={ref} objectFit={fit} objectPosition={align} {...rest} />
  );
});
