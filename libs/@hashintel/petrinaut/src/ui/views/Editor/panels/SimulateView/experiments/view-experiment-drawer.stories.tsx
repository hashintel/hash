/**
 * The full sweep-experiment drawer against fake compute. `SweepRestream`
 * exists to pick the restream-ghost behaviour: drag a slider and watch how
 * the charts bridge the compute gap before the new selection's first frames
 * arrive — held dimmed ("dim"), held as-is ("hold"), or cleared to shells
 * ("off").
 */
import { use } from "react";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import {
  FakeExperimentsProvider,
  makeParameterSweepExperiment,
} from "./experiments-story-fixtures";
import { ViewExperimentDrawer } from "./view-experiment-drawer";

import type { RestreamGhost } from "./view-experiment-drawer";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / ViewExperimentDrawer",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const DrawerFromContext = ({
  restreamGhost,
}: {
  restreamGhost: RestreamGhost;
}) => {
  const { experiments } = use(ExperimentsContext);
  return (
    <ViewExperimentDrawer
      open
      onClose={() => {}}
      experiment={experiments[0]}
      restreamGhost={restreamGhost}
    />
  );
};

type Args = { restreamGhost: RestreamGhost };

/**
 * Drag a parameter slider: frames clear while the (fake) session recomputes,
 * and the ghost variant decides what the charts show in the gap.
 */
export const SweepRestream: StoryObj<Args> = {
  args: { restreamGhost: "dim" },
  argTypes: {
    restreamGhost: { control: "select", options: ["dim", "hold", "off"] },
  },
  render: (args) => (
    <FakeExperimentsProvider
      initialExperiments={[makeParameterSweepExperiment()]}
      restreamOnSelectionChange
    >
      <DrawerFromContext restreamGhost={args.restreamGhost} />
    </FakeExperimentsProvider>
  ),
};
