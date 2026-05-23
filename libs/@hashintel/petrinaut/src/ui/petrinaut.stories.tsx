import { sirModel } from "@hashintel/petrinaut-core/examples";

import { PetrinautStoryProvider } from "./petrinaut-story-provider";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Petrinaut",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider />
    </div>
  ),
};

export const Readonly: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider readonly />
    </div>
  ),
};

export const HiddenNetManagement: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        initialTitle={sirModel.title}
        initialDefinition={sirModel.petriNetDefinition}
        hideNetManagementControls
      />
    </div>
  ),
};
