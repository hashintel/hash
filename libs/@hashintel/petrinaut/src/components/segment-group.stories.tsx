import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { useState } from "react";
import { LuLayers2 } from "react-icons/lu";
import { PiFlaskBold } from "react-icons/pi";
import { TbCategory, TbCircleFilled, TbPlayerPlay } from "react-icons/tb";

import type { SegmentOption } from "./segment-group";
import { SegmentGroup } from "./segment-group";

const meta: Meta<typeof SegmentGroup> = {
  title: "Components / SegmentGroup",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Wrapper that manages controlled state for stories. */
const SegmentGroupStory = ({
  initialValue,
  ...props
}: Omit<ComponentProps<typeof SegmentGroup>, "value" | "onChange"> & {
  initialValue: string;
}) => {
  const [value, setValue] = useState(initialValue);
  return <SegmentGroup {...props} value={value} onChange={setValue} />;
};

const basicOptions: SegmentOption[] = [
  { value: "code", label: "Code" },
  { value: "preview", label: "Preview" },
  { value: "split", label: "Split" },
];

export const Default: Story = {
  render: () => (
    <SegmentGroupStory initialValue="code" options={basicOptions} />
  ),
};

export const Small: Story = {
  render: () => (
    <SegmentGroupStory initialValue="code" options={basicOptions} size="sm" />
  ),
};

const iconOptions: SegmentOption[] = [
  { value: "edit", label: "Edit", icon: <TbCategory /> },
  { value: "simulate", label: "Simulate", icon: <TbPlayerPlay /> },
  { value: "actual", label: "Actual", icon: <TbCircleFilled /> },
];

export const WithIcons: Story = {
  render: () => <SegmentGroupStory initialValue="edit" options={iconOptions} />,
};

const iconOnlyOptions: SegmentOption[] = [
  { value: "edit", label: "Edit", icon: <TbCategory />, hideLabel: true },
  {
    value: "simulate",
    label: "Simulate",
    icon: <TbPlayerPlay />,
    hideLabel: true,
  },
  {
    value: "actual",
    label: "Actual",
    icon: <TbCircleFilled />,
    hideLabel: true,
  },
];

export const WithIconsOnly: Story = {
  render: () => (
    <SegmentGroupStory initialValue="edit" options={iconOnlyOptions} />
  ),
};

export const WithDisabledItems: Story = {
  render: () => (
    <SegmentGroupStory
      initialValue="edit"
      options={[
        { value: "edit", label: "Edit", icon: <TbCategory /> },
        {
          value: "simulate",
          label: "Simulate",
          icon: <TbPlayerPlay />,
          disabled: true,
          tooltip: "Simulate mode is not yet available.",
        },
        {
          value: "actual",
          label: "Actual",
          icon: <TbCircleFilled />,
          disabled: true,
          tooltip: "Actual mode is not yet available.",
        },
      ]}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <SegmentGroupStory initialValue="code" options={basicOptions} disabled />
  ),
};

export const TwoOptions: Story = {
  render: () => (
    <SegmentGroupStory
      initialValue="predicate"
      options={[
        { value: "predicate", label: "Predicate" },
        { value: "stochastic", label: "Stochastic Rate" },
      ]}
    />
  ),
};

const verticalIconOptions: SegmentOption[] = [
  {
    value: "experiments",
    label: "Experiments",
    icon: <LuLayers2 size={16} />,
    hideLabel: true,
    tooltip: "Experiments",
  },
  {
    value: "results",
    label: "Results",
    icon: <PiFlaskBold size={16} />,
    hideLabel: true,
    tooltip: "Results",
  },
];

export const VerticalIconOnly: Story = {
  render: () => (
    <SegmentGroupStory
      initialValue="experiments"
      options={verticalIconOptions}
      orientation="vertical"
      size="sm"
    />
  ),
};

export const VerticalIconOnlyMedium: Story = {
  render: () => (
    <SegmentGroupStory
      initialValue="experiments"
      options={verticalIconOptions}
      orientation="vertical"
      size="md"
    />
  ),
};

const verticalTextOptions: SegmentOption[] = [
  { value: "overview", label: "Overview" },
  { value: "details", label: "Details" },
  { value: "settings", label: "Settings" },
];

export const VerticalWithLabels: Story = {
  render: () => (
    <SegmentGroupStory
      initialValue="overview"
      options={verticalTextOptions}
      orientation="vertical"
    />
  ),
};
