import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ArcItem, ArcList } from "./arc-item";

const meta = {
  title: "Components / ArcItem",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const InteractiveArcItem = ({
  initialWeight = 1,
  ...props
}: {
  placeName: string;
  color?: string;
  disabled?: boolean;
  deletable?: boolean;
  initialWeight?: number;
}) => {
  const [weight, setWeight] = useState(initialWeight);
  return (
    <div style={{ width: 260 }}>
      <ArcItem
        placeName={props.placeName}
        weight={weight}
        color={props.color}
        disabled={props.disabled}
        onWeightChange={setWeight}
        onDelete={props.deletable ? () => {} : undefined}
      />
    </div>
  );
};

export const Default: Story = {
  name: "Default",
  render: () => (
    <InteractiveArcItem placeName="PlantASupply" initialWeight={1} deletable />
  ),
};

export const WithColor: Story = {
  name: "With color dot",
  render: () => (
    <InteractiveArcItem
      placeName="PlantASupply"
      color="#FF6B35"
      initialWeight={2}
      deletable
    />
  ),
};

export const Disabled: Story = {
  name: "Disabled",
  render: () => (
    <InteractiveArcItem
      placeName="Warehouse"
      color="#7B68EE"
      initialWeight={3}
      disabled
    />
  ),
};

export const NoDelete: Story = {
  name: "No delete button",
  render: () => <InteractiveArcItem placeName="Output" initialWeight={1} />,
};

export const LongName: Story = {
  name: "Long name (truncated)",
  render: () => (
    <InteractiveArcItem
      placeName="VeryLongPlaceNameThatShouldTruncate"
      color="#22c55e"
      initialWeight={5}
      deletable
    />
  ),
};

const ArcListStory = () => {
  const [weights, setWeights] = useState([1, 2, 1]);
  const updateWeight = (index: number, weight: number) => {
    setWeights((prev) => {
      const next = [...prev];
      next[index] = weight;
      return next;
    });
  };
  return (
    <div style={{ width: 260 }}>
      <ArcList>
        <ArcItem
          placeName="PlantASupply"
          color="#FF6B35"
          weight={weights[0]!}
          onWeightChange={(wt) => updateWeight(0, wt)}
          onDelete={() => {}}
        />
        <ArcItem
          placeName="Warehouse"
          color="#7B68EE"
          weight={weights[1]!}
          onWeightChange={(wt) => updateWeight(1, wt)}
          onDelete={() => {}}
        />
        <ArcItem
          placeName="Output"
          weight={weights[2]!}
          onWeightChange={(wt) => updateWeight(2, wt)}
          onDelete={() => {}}
        />
      </ArcList>
    </div>
  );
};

export const List: Story = {
  name: "ArcList (multiple items)",
  render: () => <ArcListStory />,
};
