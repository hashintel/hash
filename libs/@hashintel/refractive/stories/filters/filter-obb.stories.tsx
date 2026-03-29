import type { Meta, StoryObj } from "@storybook/react";

import { FilterOBB } from "../../src/components/filter-obb";
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

const FilterOBBStory = ({
  background,
  radius,
  ...props
}: SharedFilterProps) => (
  <FilterShowcase background={background} radius={radius}>
    {(id) => (
      <FilterOBB
        id={id}
        scaleRatio={1}
        pixelRatio={6}
        radius={radius}
        {...props}
      />
    )}
  </FilterShowcase>
);

const meta = {
  title: "Filters/Filter OBB (ObjectBoundingBox)",
  component: FilterOBBStory,
  argTypes: filterArgTypes,
  args: defaultFilterArgs,
} satisfies Meta<typeof FilterOBBStory>;

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
