import { PetrinautStoryProvider } from "./petrinaut-story-provider";
import { fusedLineNet, interfacedLineNet, manyPortsNet } from "./story-nets";

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

export const ManyPorts: Story = {
  name: "Many ports",
  args: { initialTitle: "Assembly cell", initialDefinition: manyPortsNet },
};
