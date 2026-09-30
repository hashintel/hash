import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import { CONTROLLERS_METADATA_KEY } from "../../react/controller-prototype/controllers";
import { PetrinautStoryProvider } from "../petrinaut-story-provider";

import type { Controller } from "../../react/controller-prototype/controllers";
import type { SDCPN } from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

const scheduler: Controller = {
  id: "controller__scheduler",
  name: "Scheduler",
  levers: [
    {
      id: "lever__machine_up",
      kind: "choice",
      placeId: "place_machine_up",
      transitionIds: ["trans_start_production", "trans_preventive_maintenance"],
    },
    {
      id: "lever__supplier_a_rate",
      kind: "rate",
      transitionId: "trans_order_supplier_a",
    },
    {
      id: "lever__raw_materials",
      kind: "initialTokens",
      placeId: "place_raw_materials",
    },
    {
      id: "lever__promised_lead_time",
      kind: "tokenField",
      transitionId: "trans_convert_to_backorder",
      placeId: "place_backorders",
      elementId: "order_promise",
    },
  ],
};

const withControllers = (sdcpn: SDCPN, controllers: Controller[]): SDCPN => ({
  ...sdcpn,
  metadata: {
    ...sdcpn.metadata,
    [CONTROLLERS_METADATA_KEY]: controllers,
  },
});

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
