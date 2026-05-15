import { Icon } from "@hashintel/ds-components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { useState } from "react";

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
  { value: "edit", label: "Edit", icon: <Icon name="shapes" /> },
  { value: "simulate", label: "Simulate", icon: <Icon name="play" /> },
  { value: "actual", label: "Actual", icon: <Icon name="circleFilled" /> },
];

export const WithIcons: Story = {
  render: () => <SegmentGroupStory initialValue="edit" options={iconOptions} />,
};

const iconOnlyOptions: SegmentOption[] = [
  {
    value: "edit",
    label: "Edit",
    icon: <Icon name="shapes" />,
    hideLabel: true,
  },
  {
    value: "simulate",
    label: "Simulate",
    icon: <Icon name="play" />,
    hideLabel: true,
  },
  {
    value: "actual",
    label: "Actual",
    icon: <Icon name="circleFilled" />,
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
        { value: "edit", label: "Edit", icon: <Icon name="shapes" /> },
        {
          value: "simulate",
          label: "Simulate",
          icon: <Icon name="play" />,
          disabled: true,
          tooltip: "Simulate mode is not yet available.",
        },
        {
          value: "actual",
          label: "Actual",
          icon: <Icon name="circleFilled" />,
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
    icon: <Icon name="layer" size="sm" />,
    hideLabel: true,
    tooltip: "Experiments",
  },
  {
    value: "results",
    label: "Results",
    icon: <Icon name="flask" size="sm" />,
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
