import type { Meta, StoryObj } from "@storybook/react";

import { Filter } from "../../src/components/filter";
import {
  concave,
  convex,
  convexCircle,
  lip,
} from "../../src/helpers/surface-equations";
import {
  defaultFilterArgs,
  FilterShowcase,
  filterArgTypes,
  type SharedFilterProps,
} from "../helpers";

const FilterStory = ({ background, radius, ...props }: SharedFilterProps) => (
  <FilterShowcase background={background} radius={radius}>
    {(id) => (
      <Filter
        id={id}
        scaleRatio={1}
        pixelRatio={6}
        width={400}
        height={300}
        radius={radius}
        {...props}
      />
    )}
  </FilterShowcase>
);

const meta = {
  title: "Filters/Filter (Explicit Size)",
  component: FilterStory,
  argTypes: filterArgTypes,
  args: defaultFilterArgs,
} satisfies Meta<typeof FilterStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Convex: Story = {
  args: { bezelHeightFn: convex },
};

export const ConvexCircle: Story = {
  args: { bezelHeightFn: convexCircle },
};

export const Concave: Story = {
  args: { bezelHeightFn: concave },
};

export const Lip: Story = {
  args: { bezelHeightFn: lip },
};
