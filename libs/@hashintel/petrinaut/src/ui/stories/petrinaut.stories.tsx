import * as examples from "@hashintel/petrinaut-core/examples";

import { PetrinautStoryProvider } from "./petrinaut-story-provider";
import { tileNet } from "./story-tiled-net";

import type { Meta, StoryObj } from "@storybook/react-vite";

// A copy, because a namespace cannot be read by a computed key.
const exampleNets = { ...examples };

type ExampleNetArgs = {
  example: keyof typeof exampleNets;
  /** How many copies of the example are laid out as one net. */
  copies: number;
};

const meta = {
  title: "Editor/Example nets",
  parameters: { layout: "fullscreen" },
  argTypes: {
    example: { control: "select", options: Object.keys(exampleNets) },
    copies: { control: { type: "number", min: 1 } },
  },
  args: { example: "sirModel", copies: 1 },
  render: ({ example, copies }) => {
    const { title, petriNetDefinition } = exampleNets[example];

    return (
      <PetrinautStoryProvider
        key={`${example} × ${copies}`}
        initialTitle={title}
        initialDefinition={tileNet(petriNetDefinition, copies)}
      />
    );
  },
} satisfies Meta<ExampleNetArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Sir: Story = { name: "SIR" };

export const SupplyChain: Story = {
  args: { example: "supplyChainWithDisruption" },
};

/** Supply Chain with Disruption has 39 nodes: thirteen copies have 507. */
export const FiveHundredNodes: Story = {
  name: "About 500 nodes",
  args: { example: "supplyChainWithDisruption", copies: 13 },
};
