import type { Meta, StoryObj } from "@storybook/react";

import { Filter } from "../../src/components/filter";
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

const FilterStory = (props: SharedFilterProps) => (
  <FilterShowcase>
    {(id) => (
      <Filter
        id={id}
        scaleRatio={1}
        pixelRatio={6}
        width={400}
        height={300}
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
