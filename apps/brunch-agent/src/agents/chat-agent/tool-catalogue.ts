import {
  BRUNCH_DECLARED_PROJECTION_MODE,
  BRUNCH_DEEP_CONSTRUCTION_MODE,
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
  type CanonicalPetrinautMode,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  petrinautAiTools,
  type PetrinautAiToolName,
} from "@hashintel/petrinaut-core/ai";

export type ToolDefinitionOwner =
  | "flue"
  | "brunch-core"
  | "petrinaut-core"
  | "brunch-app";

export type ToolExecutionOwner = "flue" | "brunch-app" | "petrinaut-website";

export type ToolCapabilityClass =
  | "substrate"
  | "ledger"
  | "petrinaut-read"
  | "petrinaut-mutation"
  | "petrinaut-command"
  | "petrinaut-experiment"
  | "explanation"
  | "diagnostic";

export interface BrunchToolCatalogueEntry {
  readonly name: string;
  readonly definitionOwner: ToolDefinitionOwner;
  readonly executionOwner: ToolExecutionOwner;
  readonly capability: ToolCapabilityClass;
}

const petrinautCapabilityByName = {
  addPlace: "petrinaut-mutation",
  updatePlace: "petrinaut-mutation",
  updatePlacePosition: "petrinaut-mutation",
  removePlace: "petrinaut-mutation",
  addTransition: "petrinaut-mutation",
  updateTransition: "petrinaut-mutation",
  updateTransitionPosition: "petrinaut-mutation",
  removeTransition: "petrinaut-mutation",
  addArc: "petrinaut-mutation",
  removeArc: "petrinaut-mutation",
  updateArcWeight: "petrinaut-mutation",
  updateArcType: "petrinaut-mutation",
  updateArcPlace: "petrinaut-mutation",
  addType: "petrinaut-mutation",
  updateType: "petrinaut-mutation",
  removeType: "petrinaut-mutation",
  addTypeElement: "petrinaut-mutation",
  updateTypeElement: "petrinaut-mutation",
  removeTypeElement: "petrinaut-mutation",
  moveTypeElement: "petrinaut-mutation",
  addDifferentialEquation: "petrinaut-mutation",
  updateDifferentialEquation: "petrinaut-mutation",
  removeDifferentialEquation: "petrinaut-mutation",
  addParameter: "petrinaut-mutation",
  updateParameter: "petrinaut-mutation",
  removeParameter: "petrinaut-mutation",
  addScenario: "petrinaut-mutation",
  updateScenario: "petrinaut-mutation",
  removeScenario: "petrinaut-mutation",
  addMetric: "petrinaut-mutation",
  updateMetric: "petrinaut-mutation",
  removeMetric: "petrinaut-mutation",
  addSubnet: "petrinaut-mutation",
  updateSubnet: "petrinaut-mutation",
  removeSubnet: "petrinaut-mutation",
  addComponentInstance: "petrinaut-mutation",
  updateComponentInstance: "petrinaut-mutation",
  updateComponentInstancePosition: "petrinaut-mutation",
  removeComponentInstance: "petrinaut-mutation",
  deleteItemsByIds: "petrinaut-mutation",
  commitNodePositions: "petrinaut-mutation",
  applyAutoLayout: "petrinaut-command",
  getLatestNetDefinition: "petrinaut-read",
  getNetCompilationErrors: "petrinaut-read",
  setNetTitle: "petrinaut-mutation",
  readPetrinautDoc: "petrinaut-read",
  createExperiment: "petrinaut-experiment",
} as const satisfies Record<PetrinautAiToolName, ToolCapabilityClass>;

export const assertPetrinautToolCatalogueConformance = (
  canonicalNames: readonly string[] = Object.keys(petrinautAiTools),
): void => {
  const classifiedNames = Object.keys(petrinautCapabilityByName);
  const unclassified = canonicalNames.filter(
    (name) => !classifiedNames.includes(name),
  );
  const obsolete = classifiedNames.filter(
    (name) => !canonicalNames.includes(name),
  );
  if (unclassified.length > 0 || obsolete.length > 0)
    throw new Error(
      `Petrinaut tool classification mismatch (unclassified: ${unclassified.join(", ") || "none"}; obsolete: ${obsolete.join(", ") || "none"}).`,
    );
};

assertPetrinautToolCatalogueConformance();

export const canonicalPetrinautToolCatalogue = Object.keys(
  petrinautAiTools,
).map(
  (name): BrunchToolCatalogueEntry => ({
    name,
    definitionOwner: "petrinaut-core",
    executionOwner: "petrinaut-website",
    capability: petrinautCapabilityByName[name as PetrinautAiToolName],
  }),
);

const integratedBrunchTools: readonly BrunchToolCatalogueEntry[] = [
  {
    name: "task",
    definitionOwner: "flue",
    executionOwner: "flue",
    capability: "substrate",
  },
  {
    name: "activate_skill",
    definitionOwner: "flue",
    executionOwner: "flue",
    capability: "substrate",
  },
  {
    name: "read_skill_resource",
    definitionOwner: "flue",
    executionOwner: "flue",
    capability: "substrate",
  },
  {
    name: "mutate_workpiece",
    definitionOwner: "brunch-core",
    executionOwner: "brunch-app",
    capability: "ledger",
  },
  {
    name: "read_workpiece",
    definitionOwner: "brunch-core",
    executionOwner: "brunch-app",
    capability: "ledger",
  },
  {
    name: "query_workpiece",
    definitionOwner: "brunch-app",
    executionOwner: "brunch-app",
    capability: "explanation",
  },
  {
    name: "ping",
    definitionOwner: "brunch-app",
    executionOwner: "brunch-app",
    capability: "diagnostic",
  },
  ...canonicalPetrinautToolCatalogue,
];

/**
 * Expected provider-visible names and ownership for each canonical evaluation
 * mode. Schemas stay with Petrinaut; this map deliberately classifies names only.
 */
export const toolCatalogueByMode: Readonly<
  Record<CanonicalPetrinautMode, readonly BrunchToolCatalogueEntry[]>
> = {
  [STOCK_OVER_FLUE_MODE]: canonicalPetrinautToolCatalogue,
  [INTEGRATED_BRUNCH_MODE]: integratedBrunchTools,
  [BRUNCH_DECLARED_PROJECTION_MODE]: integratedBrunchTools,
  [BRUNCH_DEEP_CONSTRUCTION_MODE]: integratedBrunchTools,
};
