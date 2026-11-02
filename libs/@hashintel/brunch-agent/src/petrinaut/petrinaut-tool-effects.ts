import { selectionItemTypes } from "@hashintel/petrinaut-core/selection";

import type { PetrinautAiToolName } from "@hashintel/petrinaut-core/ai";

/** The net elements a Brunch explanation can name, and a canonical change can target. */
export const netElementKinds = [
  ...selectionItemTypes,
  // Kinds Petrinaut has no selection for.
  "typeElement",
  "scenario",
  "metric",
  "subnet",
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
  /** Element kinds whose meaning a document change made by this tool can change, and so whose IDs it can name. */
  readonly targets: readonly NetElementKind[];
  /** It removes what the user built, so the user approves it first. */
  readonly destructive: boolean;
}

const read = {
  capability: "petrinaut-read",
  targets: [],
  destructive: false,
} as const;
const mutation = (...targets: readonly NetElementKind[]) =>
  ({ capability: "petrinaut-mutation", targets, destructive: false }) as const;
const removal = (...targets: readonly NetElementKind[]) =>
  ({ capability: "petrinaut-mutation", targets, destructive: true }) as const;
/** Positions are layout, which is not part of what an element means, so no element is credited with a layout change. */
const layout = mutation();

/** What each canonical Petrinaut tool does to the bound document. */
export const petrinautToolEffects = {
  addPlace: mutation("place"),
  updatePlace: mutation("place"),
  updatePlacePosition: layout,
  removePlace: removal("place"),
  addTransition: mutation("transition"),
  updateTransition: mutation("transition"),
  updateTransitionPosition: layout,
  removeTransition: removal("transition"),
  addArc: mutation("arc"),
  removeArc: removal("arc"),
  updateArcWeight: mutation("arc"),
  updateArcType: mutation("arc"),
  updateArcPlace: mutation("arc"),
  addType: mutation("type"),
  updateType: mutation("type"),
  removeType: removal("type"),
  // A type element belongs to its type, so a change to one changes both.
  addTypeElement: mutation("typeElement", "type"),
  updateTypeElement: mutation("typeElement", "type"),
  removeTypeElement: removal("typeElement", "type"),
  moveTypeElement: mutation("typeElement", "type"),
  addDifferentialEquation: mutation("differentialEquation"),
  updateDifferentialEquation: mutation("differentialEquation"),
  removeDifferentialEquation: removal("differentialEquation"),
  addParameter: mutation("parameter"),
  updateParameter: mutation("parameter"),
  removeParameter: removal("parameter"),
  addScenario: mutation("scenario"),
  updateScenario: mutation("scenario"),
  removeScenario: removal("scenario"),
  addMetric: mutation("metric"),
  updateMetric: mutation("metric"),
  removeMetric: removal("metric"),
  addSubnet: mutation("subnet"),
  updateSubnet: mutation("subnet"),
  removeSubnet: removal("subnet"),
  addComponentInstance: mutation("componentInstance"),
  updateComponentInstance: mutation("componentInstance"),
  updateComponentInstancePosition: layout,
  removeComponentInstance: removal("componentInstance"),
  addFusion: mutation("fusion"),
  updateFusion: mutation("fusion"),
  removeFusion: removal("fusion"),
  addFusionMember: mutation("fusion"),
  removeFusionMember: removal("fusion"),
  deleteItemsByIds: removal(...selectionItemTypes),
  commitNodePositions: layout,
  setNetTitle: mutation(),
  applyAutoLayout: {
    capability: "petrinaut-command",
    targets: [],
    destructive: false,
  },
  getLatestNetDefinition: read,
  getNetCompilationErrors: read,
  readPetrinautDoc: read,
  createExperiment: {
    capability: "petrinaut-experiment",
    targets: [],
    destructive: false,
  },
} as const satisfies Record<PetrinautAiToolName, PetrinautToolEffect>;

/** The canonical operations that remove what the user built. */
export type DestructivePetrinautOperation = {
  [
    Name in PetrinautAiToolName
  ]: (typeof petrinautToolEffects)[Name]["destructive"] extends true
    ? Name
    : never;
}[PetrinautAiToolName];
