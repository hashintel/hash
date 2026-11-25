import { PetrinautStoryProvider } from "./petrinaut-story-provider";
import {
  fusedLineNet,
  interfacedLineNet,
  manyPortsNet,
  visualizedLineNet,
} from "./story-nets";

import type { Meta, StoryObj } from "@storybook/react-vite";

/** Nets built from components, which none of Core's examples is. */
const meta = {
  title: "Editor/Composed nets",
  component: PetrinautStoryProvider,
  parameters: { layout: "fullscreen" },
  args: { hideNetManagementControls: "all" },
} satisfies Meta<typeof PetrinautStoryProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PlaceFusion: Story = {
  name: "Place fusion",
  args: { initialTitle: "Fused line", initialDefinition: fusedLineNet },
};

export const Interfaces: Story = {
  args: {
    initialTitle: "Interfaced line",
    initialDefinition: interfacedLineNet,
  },
};

/**
 * A visualizer at each level: the Visualizer tab of the bottom panel draws
 * the root net's, and each station's card draws the Station component's over
 * that instance's own state. Start a simulation to see them move.
 */
export const NetVisualizers: Story = {
  name: "Net visualizers",
  args: {
    initialTitle: "Visualized line",
    initialDefinition: visualizedLineNet,
  },
};

export const ManyPorts: Story = {
  name: "Many ports",
  args: { initialTitle: "Assembly cell", initialDefinition: manyPortsNet },
};
