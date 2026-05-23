import { ark } from "@ark-ui/react/factory";
import { type ComponentProps, forwardRef } from "react";

import { Stack, type StackProps, styled } from "@hashintel/ds-helpers/jsx";

import { skeletonRecipe } from "./skeleton.recipe";

export type SkeletonProps = ComponentProps<typeof Skeleton>;
export const Skeleton = styled(ark.div, skeletonRecipe);

export type SkeletonCircleProps = ComponentProps<typeof SkeletonCircle>;
export const SkeletonCircle = styled(ark.div, skeletonRecipe, {
  defaultProps: { circle: true } as never,
});

export interface SkeletonTextProps extends SkeletonProps {
  /**
   * Number of lines to display
   * @default 3
   */
  noOfLines?: number | undefined;
  rootProps?: StackProps | undefined;
}

export const SkeletonText = forwardRef<HTMLDivElement, SkeletonTextProps>(
  (props, ref) => {
    const { noOfLines = 3, gap, rootProps, ...skeletonProps } = props;
    return (
      <Stack ref={ref} gap={gap} width="full" {...rootProps}>
        {[...Array(noOfLines).keys()].map((index) => (
          <Skeleton
            key={index}
            height="4"
            // @ts-expect-error - percentage strings are not in the size token set
            _last={{ maxW: noOfLines === 1 ? "100%" : "80%" }}
            {...skeletonProps}
          />
        ))}
      </Stack>
    );
  },
);
