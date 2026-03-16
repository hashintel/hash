import type { Meta, StoryObj } from "@storybook/react";

import { FilterPolar } from "../../src/components/filter-polar";
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

type FilterPolarStoryProps = Omit<
  SharedFilterProps,
  "specularOpacity" | "specularAngle"
>;

const FilterPolarStory = ({ background, ...props }: FilterPolarStoryProps) => (
  <FilterShowcase background={background}>
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
