import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { useState } from "react";
import { TbCategory, TbCircleFilled, TbPlayerPlay } from "react-icons/tb";

import type { SegmentOption } from "./segment-group";
import { SegmentGroup } from "./segment-group";

export default {
  title: "Components / SegmentGroup",
} satisfies Meta;

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
