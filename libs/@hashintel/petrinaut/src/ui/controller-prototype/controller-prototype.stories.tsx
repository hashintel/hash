import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import { PetrinautStoryProvider } from "../petrinaut-story-provider";
import {
  demoConstraints,
  demoControllers,
  withConstraints,
  withControllers,
} from "./scheduler-example";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Petrinaut/Controller prototype",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Supply Chain With Disruption with two controllers, Scheduler and Purchasing. */
export const Scheduler: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        initialTitle={supplyChainWithDisruption.title}
        initialDefinition={withConstraints(
          withControllers(
            supplyChainWithDisruption.petriNetDefinition,
            demoControllers
          ),
          demoConstraints
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

/** The two controllers, read-only. */
export const ReadOnly: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        readonly
        initialTitle={supplyChainWithDisruption.title}
        initialDefinition={withConstraints(
          withControllers(
            supplyChainWithDisruption.petriNetDefinition,
            demoControllers
          ),
          demoConstraints
        )}
      />
    </div>
  ),
};
