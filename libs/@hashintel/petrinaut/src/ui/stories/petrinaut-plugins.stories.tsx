import { sirModel } from "@hashintel/petrinaut-core/examples";

import { PetrinautStoryProvider } from "./petrinaut-story-provider";
import { contributingPlugins, echoAssistantPlugin } from "./story-plugins";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Editor/Plugins",
  component: PetrinautStoryProvider,
  parameters: { layout: "fullscreen" },
  args: {
    initialTitle: sirModel.title,
    initialDefinition: sirModel.petriNetDefinition,
  },
} satisfies Meta<typeof PetrinautStoryProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Two plugins: see them in User settings → Plugins, and their setting under Viewport. */
export const Contributions: Story = {
  args: { plugins: contributingPlugins },
};

/** An assistant from a plugin: its content and title bar in the editor's panel. */
export const Assistant: Story = {
  args: { plugins: [echoAssistantPlugin] },
};
