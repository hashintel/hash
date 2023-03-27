import "react-loading-skeleton/dist/skeleton.css";

// eslint-disable-next-line import/no-named-default
import { default as LibSkeleton, SkeletonProps } from "react-loading-skeleton";

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
