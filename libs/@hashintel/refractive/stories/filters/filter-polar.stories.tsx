import type { Meta, StoryObj } from "@storybook/react";

import { FilterPolar } from "../../src/components/filter-polar";
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

type FilterPolarStoryProps = Omit<
  SharedFilterProps,
  "specularOpacity" | "specularAngle"
>;

const FilterPolarStory = (props: FilterPolarStoryProps) => (
  <FilterShowcase>
    {(id) => <FilterPolar id={id} pixelRatio={6} {...props} />}
  </FilterShowcase>
);

const {
  specularOpacity: _a,
  specularAngle: _b,
  ...polarArgTypes
} = filterArgTypes;
const {
  specularOpacity: _c,
  specularAngle: _d,
  ...polarArgs
} = defaultFilterArgs;

const meta = {
  title: "Filters/Filter Polar (Debug)",
  component: FilterPolarStory,
  argTypes: polarArgTypes,
  args: polarArgs,
} satisfies Meta<typeof FilterPolarStory>;

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
