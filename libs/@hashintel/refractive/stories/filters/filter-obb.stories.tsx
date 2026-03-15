import type { Meta, StoryObj } from "@storybook/react";

import { FilterOBB } from "../../src/components/filter-obb";
import {
  CONCAVE,
  CONVEX,
  CONVEX_CIRCLE,
  LIP,
} from "../../src/helpers/surface-equations";
import {
  defaultFilterArgs,
  FilterShowcase,
  filterArgTypes,
  type SharedFilterProps,
} from "../helpers";

const FilterOBBStory = (props: SharedFilterProps) => (
  <FilterShowcase>
    {(id) => <FilterOBB id={id} scaleRatio={1} pixelRatio={6} {...props} />}
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
  args: { bezelHeightFn: CONVEX },
};

export const ConvexCircle: Story = {
  args: { bezelHeightFn: CONVEX_CIRCLE },
};

export const Concave: Story = {
  args: { bezelHeightFn: CONCAVE },
};

export const Lip: Story = {
  args: { bezelHeightFn: LIP },
};
