import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import { PetrinautStoryProvider } from "../petrinaut-story-provider";
import { scheduler, withControllers } from "./scheduler-example";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Petrinaut/Controller prototype",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Supply Chain With Disruption with one controller, Scheduler, holding one lever of each kind. */
export const Scheduler: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        initialTitle={supplyChainWithDisruption.title}
        initialDefinition={withControllers(
          supplyChainWithDisruption.petriNetDefinition,
          [scheduler],
        )}
      />
    </div>
  ),
};

/** The same net with no controllers yet. */
export const NoControllers: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        initialTitle={supplyChainWithDisruption.title}
        initialDefinition={supplyChainWithDisruption.petriNetDefinition}
      />
    </div>
  ),
};

/** Scheduler, read-only. */
export const ReadOnly: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        readonly
        initialTitle={supplyChainWithDisruption.title}
        initialDefinition={withControllers(
          supplyChainWithDisruption.petriNetDefinition,
          [scheduler],
        )}
      />
    </div>
  ),
};
