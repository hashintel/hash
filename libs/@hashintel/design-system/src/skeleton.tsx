import "react-loading-skeleton/dist/skeleton.css";

import type { SkeletonProps } from "react-loading-skeleton";
// eslint-disable-next-line import/no-named-default
import { default as LibSkeleton } from "react-loading-skeleton";

export const Skeleton = ({
  baseColor = "#ebedef",
  highlightColor = "rgba(0, 0, 0, 0.04)",
  ...rest
}: SkeletonProps) => {
  return (
    <LibSkeleton
      baseColor={baseColor}
      highlightColor={highlightColor}
      {...rest}
    />
  );
};
