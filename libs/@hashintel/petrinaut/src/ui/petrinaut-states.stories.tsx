import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  createStoryImportResolver,
  importingLineNet,
  logisticsLibrary,
  missingLibraryId,
  toolingLibrary,
} from "./libraries-story-fixtures";
import { PetrinautStoryProvider } from "./petrinaut-story-provider";
import {
  barePetriNet,
  colouredDynamicsNet,
  colouredTokenFlowNet,
  stochasticTimingNet,
} from "./story-nets";
import { pluginsWithOneBroken } from "./story-plugins";

import type { ResolveImport } from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

/** States of the editor that its host decides, which no click reaches. */
const meta = {
  title: "States/Editor",
  component: PetrinautStoryProvider,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PetrinautStoryProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

const sir = {
  initialTitle: sirModel.title,
  initialDefinition: sirModel.petriNetDefinition,
};

export const ReadOnly: Story = {
  name: "Read-only document",
  args: { ...sir, readonly: true },
};

export const NetManagementHidden: Story = {
  name: "Net management hidden",
  args: { ...sir, hideNetManagementControls: "all" },
};

/**
 * A handle that supports no extension: a plain Petri net. Edit
 * `capabilities` in the controls to switch extensions back on.
 */
export const ExtensionsDisabled: Story = {
  name: "Extensions disabled",
  args: {
    initialTitle: "Bare Petri net",
    initialDefinition: barePetriNet,
    hideNetManagementControls: "all",
    capabilities: {
      disabledExtensions: ["colors", "stochasticity", "dynamics", "parameters"],
    },
  },
  // The handle is created once, so other capabilities mount another editor.
  render: (args) => (
    <PetrinautStoryProvider key={JSON.stringify(args.capabilities)} {...args} />
  ),
};

/** A handle that supports token types and nothing else. */
export const ColouredTokensOnly: Story = {
  name: "Coloured tokens only",
  args: {
    initialTitle: "Coloured tokens only",
    initialDefinition: colouredTokenFlowNet,
    hideNetManagementControls: "all",
    capabilities: {
      disabledExtensions: ["stochasticity", "dynamics", "parameters"],
    },
  },
};

/** A handle that supports token types and dynamics. */
export const ColouredTokensWithDynamics: Story = {
  name: "Coloured tokens with dynamics",
  args: {
    initialTitle: "Coloured dynamics",
    initialDefinition: colouredDynamicsNet,
    hideNetManagementControls: "all",
    capabilities: { disabledExtensions: ["stochasticity", "parameters"] },
  },
};

/** A handle that supports stochastic rates and nothing else. */
export const StochasticTimingOnly: Story = {
  name: "Stochastic timing only",
  args: {
    initialTitle: "Stochastic timing",
    initialDefinition: stochasticTimingNet,
    hideNetManagementControls: "all",
    capabilities: { disabledExtensions: ["colors", "dynamics", "parameters"] },
  },
};

/** A net with colours and dynamics on a handle that supports neither: their data is kept, and hidden. */
export const ExtensionsDisabledOverTheirData: Story = {
  name: "Extensions disabled over their data",
  args: {
    ...sir,
    hideNetManagementControls: "all",
    capabilities: { disabledExtensions: ["colors", "dynamics"] },
  },
};

// At module scope: a new resolver or a new list would create a new editor
// instance on every render, and resolve every import again.
const resolveStoryImport = createStoryImportResolver(2500);
const offeredLibraries = [
  logisticsLibrary.id,
  toolingLibrary.id,
  missingLibraryId,
];

/**
 * A document over three imports. Logistics is in memory. Tooling arrives
 * after a moment, and the editor says "Resolving" over a blurred backdrop
 * until it does. The third library fails: its instance is drawn unresolved,
 * the Components panel says why under its id, and Diagnostics reports it.
 * The Components panel shows once Net Components is on in the Labs settings.
 */
export const Imports: Story = {
  name: "Imports: one slow, one failing",
  args: {
    initialTitle: "Imported line",
    initialDefinition: importingLineNet,
    hideNetManagementControls: "all",
    resolveImport: resolveStoryImport,
    libraries: offeredLibraries,
  },
};

// A library the host holds in memory: it resolves at once, with no loader.
const resolveLogistics: ResolveImport = (id) =>
  id === logisticsLibrary.id ? logisticsLibrary : undefined;
const logisticsOnly = [logisticsLibrary.id];

/**
 * An empty net in an editor its host keeps to composing, over a library the
 * host holds in memory. The Components panel shows whatever the Net
 * Components setting says.
 */
export const CompositionOnly: Story = {
  name: "Composition only",
  args: {
    initialTitle: "Composed line",
    hideNetManagementControls: "all",
    resolveImport: resolveLogistics,
    libraries: logisticsOnly,
    rules: { edit: "compose" },
  },
};

/**
 * A plugin that throws while it starts: the editor runs on without it, and
 * User settings, open here on Plugins, lists it as failed.
 */
export const PluginFails: Story = {
  name: "Plugin fails",
  args: {
    ...sir,
    plugins: pluginsWithOneBroken,
    initialNavigation: {
      overlay: { type: "user-settings", section: "plugins" },
    },
  },
};
