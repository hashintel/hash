import {
  compileScenario,
  type SDCPN,
  type ScenarioHir,
} from "@hashintel/petrinaut-core";
import {
  deploymentPipelineSDCPN,
  sirModel,
} from "@hashintel/petrinaut-core/examples";
import {
  compileHirArtifacts,
  lowerScenarioToHir,
} from "@hashintel/petrinaut-core/hir";

import { PetrinautPreview } from "./petrinaut-preview";

import type { SimulationParameterBoundsByIdentifier } from "../views/shared/simulation-parameter-bounds";
import type { PetrinautPreviewQuickSimulation } from "./quick-simulation";
import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * The artifacts an embed host normally compiles at build time, compiled here
 * instead. The demo website precompiles them to JSON only to keep the HIR
 * compiler out of its bundle; the compiler itself runs anywhere, so a story
 * needs no build step to exercise Quick Simulation.
 *
 * At module scope rather than in a hook: the models are constants, and the
 * simulation provider keys its lowering on artifact identity, which a value
 * rebuilt per render would churn.
 */
const compileQuickSimulation = (
  definition: SDCPN,
): Pick<
  PetrinautPreviewQuickSimulation,
  "hirArtifacts" | "scenarioHirById"
> => {
  const { artifacts, failures } = compileHirArtifacts(definition);
  if (failures.length > 0) {
    throw new Error(
      `Story model failed HIR compilation:\n${failures
        .map(
          (failure) =>
            `${failure.itemType}:${failure.itemId}: ${failure.diagnostics
              .map((diagnostic) => diagnostic.message)
              .join("; ")}`,
        )
        .join("\n")}`,
    );
  }

  const scenarioHirById: Record<string, ScenarioHir> = {};
  for (const scenario of definition.scenarios ?? []) {
    const hir = lowerScenarioToHir({
      parameterOverrides: scenario.parameterOverrides,
      initialState: scenario.initialState,
    });
    const outcome = compileScenario(
      scenario,
      hir,
      definition.parameters,
      definition.places,
      definition.types,
    );
    if (!outcome.ok) {
      throw new Error(
        `Story scenario ${scenario.id} failed compilation:\n${outcome.errors
          .map((error) => error.message)
          .join("\n")}`,
      );
    }
    scenarioHirById[scenario.id] = hir;
  }

  return { hirArtifacts: artifacts, scenarioHirById };
};

const sirDefinition = sirModel.petriNetDefinition;
const deploymentDefinition = deploymentPipelineSDCPN.petriNetDefinition;

/** The bounds the demo website publishes for these two models. */
const sirBounds: SimulationParameterBoundsByIdentifier = {
  population: { min: 100, max: 10_000, step: 100 },
  infected_ratio: { min: 0.0001, max: 0.2, step: 0.0001 },
};

const deploymentBounds: SimulationParameterBoundsByIdentifier = {
  deployment_rate: { min: 0.1, max: 2, step: 0.05 },
  failure_base_rate: { min: 0.01, max: 0.3, step: 0.01 },
  finish_rate: { min: 0.05, max: 1, step: 0.01 },
  incident_rate: { min: 0.01, max: 0.5, step: 0.01 },
  mean_size: { min: 0.25, max: 3, step: 0.05 },
  resolution_rate: { min: 0.05, max: 1, step: 0.01 },
  risk_multiplier: { min: 0.25, max: 3, step: 0.05 },
  severity_multiplier: { min: 0.5, max: 3, step: 0.05 },
};

const sirQuickSimulation: PetrinautPreviewQuickSimulation = {
  ...compileQuickSimulation(sirDefinition),
  dt: 0.01,
  maxTime: 40,
  parameterBounds: sirBounds,
};

const deploymentQuickSimulation: PetrinautPreviewQuickSimulation = {
  ...compileQuickSimulation(deploymentDefinition),
  dt: 0.05,
  maxTime: 120,
  parameterBounds: deploymentBounds,
};

/**
 * Preview fills its host, so every story gives it one. The default frame is
 * the size an embed usually gets in a page, not the whole window.
 */
const Frame = ({
  children,
  height = "100vh",
  width = "100vw",
}: {
  children: React.ReactNode;
  height?: string;
  width?: string;
}) => (
  <div style={{ height, width, display: "flex", background: "#f6f7f8" }}>
    <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{children}</div>
  </div>
);

const meta = {
  title: "Petrinaut / Preview",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The embed a host gets with nothing but a model: canvas, minimap, viewport
 * controls, and the inspector. No playback bar, because Quick Simulation is
 * opt-in.
 */
export const ReadOnly: Story = {
  render: () => (
    <Frame>
      <PetrinautPreview definition={sirDefinition} title="SIR Epidemic Model" />
    </Frame>
  ),
};

/**
 * The same model with Quick Simulation supplied. The playback bar carries the
 * scenario and parameter controls, and expands into a timeline once frames
 * arrive.
 */
export const QuickSimulation: Story = {
  render: () => (
    <Frame>
      <PetrinautPreview
        definition={sirDefinition}
        quickSimulation={sirQuickSimulation}
        title="SIR Epidemic Model"
      />
    </Frame>
  ),
};

/**
 * With a full-size location for the model, Preview offers it in the header.
 * The link points at the published demo, since Storybook hosts no such page.
 */
export const WithFullViewLink: Story = {
  render: () => (
    <Frame>
      <PetrinautPreview
        definition={sirDefinition}
        fullViewUrl="https://petrinaut.org/examples/sir-epidemic-model"
        quickSimulation={sirQuickSimulation}
        title="SIR Epidemic Model"
      />
    </Frame>
  ),
};

/**
 * A model whose transitions and equations carry code, for the inspector's
 * code view: select a transition for its rate function and kernel, or a place
 * with dynamics for the equation driving it.
 */
export const ModelWithCode: Story = {
  render: () => (
    <Frame>
      <PetrinautPreview
        definition={deploymentDefinition}
        quickSimulation={deploymentQuickSimulation}
        title="Deployment Pipeline"
      />
    </Frame>
  ),
};

/**
 * The narrow embed: under 640px the inspector docks under the canvas instead
 * of beside it, and the header's labels fold away to their icons.
 */
export const NarrowEmbed: Story = {
  render: () => (
    <Frame height="680px" width="420px">
      <PetrinautPreview
        definition={sirDefinition}
        fullViewUrl="https://petrinaut.org/examples/sir-epidemic-model"
        quickSimulation={sirQuickSimulation}
        title="SIR Epidemic Model"
      />
    </Frame>
  ),
};
