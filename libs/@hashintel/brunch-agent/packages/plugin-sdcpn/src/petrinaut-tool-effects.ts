import { brunchTools } from "@hashintel/brunch-agent/constants";

import type { PetrinautAiToolName } from "@hashintel/petrinaut-core/ai";

/** The net elements a Brunch explanation can name, and a canonical change can target. */
export const netElementKinds = [
  "place",
  "transition",
  "arc",
  "type",
  "typeElement",
  "parameter",
  "differentialEquation",
  "scenario",
  "metric",
  "subnet",
  "componentInstance",
] as const;

export type NetElementKind = (typeof netElementKinds)[number];

/**
 * A read or experiment leaves the bound document unchanged; a mutation or
 * command may change it.
 */
export type PetrinautToolCapability =
  | "petrinaut-read"
  | "petrinaut-mutation"
  | "petrinaut-command"
  | "petrinaut-experiment";

export interface PetrinautToolEffect {
  readonly capability: PetrinautToolCapability;
  /** Element kinds whose IDs a document change made by this tool can name. */
  readonly targets: readonly NetElementKind[];
}

const read = { capability: "petrinaut-read", targets: [] } as const;
const mutation = (...targets: readonly NetElementKind[]) =>
  ({ capability: "petrinaut-mutation", targets }) as const;

/** What each canonical Petrinaut tool does to the bound document. */
export const petrinautToolEffects = {
  addPlace: mutation("place"),
  updatePlace: mutation("place"),
  updatePlacePosition: mutation("place"),
  removePlace: mutation("place"),
  addTransition: mutation("transition"),
  updateTransition: mutation("transition"),
  updateTransitionPosition: mutation("transition"),
  removeTransition: mutation("transition"),
  addArc: mutation("arc"),
  removeArc: mutation("arc"),
  updateArcWeight: mutation("arc"),
  updateArcType: mutation("arc"),
  updateArcPlace: mutation("arc"),
  addType: mutation("type"),
  updateType: mutation("type"),
  removeType: mutation("type"),
  // A type element belongs to its type, so a change to one changes both.
  addTypeElement: mutation("typeElement", "type"),
  updateTypeElement: mutation("typeElement", "type"),
  removeTypeElement: mutation("typeElement", "type"),
  moveTypeElement: mutation("typeElement", "type"),
  addDifferentialEquation: mutation("differentialEquation"),
  updateDifferentialEquation: mutation("differentialEquation"),
  removeDifferentialEquation: mutation("differentialEquation"),
  addParameter: mutation("parameter"),
  updateParameter: mutation("parameter"),
  removeParameter: mutation("parameter"),
  addScenario: mutation("scenario"),
  updateScenario: mutation("scenario"),
  removeScenario: mutation("scenario"),
  addMetric: mutation("metric"),
  updateMetric: mutation("metric"),
  removeMetric: mutation("metric"),
  addSubnet: mutation("subnet"),
  updateSubnet: mutation("subnet"),
  removeSubnet: mutation("subnet"),
  addComponentInstance: mutation("componentInstance"),
  updateComponentInstance: mutation("componentInstance"),
  updateComponentInstancePosition: mutation("componentInstance"),
  removeComponentInstance: mutation("componentInstance"),
  deleteItemsByIds: mutation(...netElementKinds),
  commitNodePositions: mutation("place", "transition", "componentInstance"),
  setNetTitle: mutation(),
  applyAutoLayout: {
    capability: "petrinaut-command",
    targets: ["place", "transition"],
  },
  getLatestNetDefinition: read,
  getNetCompilationErrors: read,
  readPetrinautDoc: read,
  createExperiment: { capability: "petrinaut-experiment", targets: [] },
} as const satisfies Record<PetrinautAiToolName, PetrinautToolEffect>;

const canonicalEffectOf = (toolName: string): PetrinautToolEffect | undefined =>
  Object.hasOwn(petrinautToolEffects, toolName)
    ? petrinautToolEffects[toolName as PetrinautAiToolName]
    : undefined;

/**
 * Whether a settled browser call may have changed the bound document. The
 * experiment draft prepares in editor memory only. An unknown tool's effect is
 * unknown, so it counts as a possible change.
 */
export const browserToolMutatesDocument = (toolName: string): boolean => {
  if (toolName === brunchTools.draftPetrinautExperiment) return false;
  const capability = canonicalEffectOf(toolName)?.capability;
  return (
    capability !== "petrinaut-read" && capability !== "petrinaut-experiment"
  );
};

/** The element kinds a canonical tool's document change can name; none for other tools. */
export const petrinautToolTargets = (
  toolName: string,
): readonly NetElementKind[] => canonicalEffectOf(toolName)?.targets ?? [];
