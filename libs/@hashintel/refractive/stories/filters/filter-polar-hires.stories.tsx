import type { Meta, StoryObj } from "@storybook/react";

import { FilterPolarHiRes } from "../../src/components/filter-polar-hires";
import {
  concave,
  convex,
  convexCircle,
  lip,
} from "../../src/helpers/surface-equations";
import { FilterShowcase } from "../helpers";
import type { SurfaceFnDef } from "../../src/helpers/surface-equations";
import type { BackgroundType } from "../helpers";

type FilterPolarHiResStoryProps = {
  blur: number;
  radius: number;
  glassThickness: number;
  refractiveIndex: number;
  bezelHeightFn: SurfaceFnDef;
  background: BackgroundType;
};

const FilterPolarHiResStory = ({
  background,
  radius,
  ...props
}: FilterPolarHiResStoryProps) => (
  <FilterShowcase background={background} radius={radius}>
    {(id) => (
      <FilterPolarHiRes id={id} scaleRatio={1} radius={radius} {...props} />
    )}
  </FilterShowcase>
);

const meta = {
  title: "Filters/Filter Polar Hi-Res (Single Image)",
  component: FilterPolarHiResStory,
  argTypes: {
    blur: {
      control: { type: "range" as const, min: 0, max: 20, step: 0.5 },
    },
    radius: {
      control: { type: "range" as const, min: 0, max: 100, step: 1 },
    },
    glassThickness: {
      control: { type: "range" as const, min: 0, max: 300, step: 1 },
    },
    refractiveIndex: {
      control: { type: "range" as const, min: 1, max: 3, step: 0.01 },
    },
    bezelHeightFn: { table: { disable: true } },
    background: {
      control: { type: "inline-radio" as const },
      options: ["article", "checkerboard"],
    },
  },
  args: {
    blur: 2,
    radius: 20,
    glassThickness: 70,
    refractiveIndex: 1.5,
    bezelHeightFn: convex,
    background: "article",
  },
} satisfies Meta<typeof FilterPolarHiResStory>;

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
