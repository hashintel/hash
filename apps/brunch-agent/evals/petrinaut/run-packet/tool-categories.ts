import {
  brunchTools,
  netReaderToolNames,
  petrinautToolEffects,
} from "@hashintel/brunch-agent";
import {
  createExperimentToolName,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core/ai";

/** What a tool call spends a step on, for turn-time accounting. */
export const toolCategories = [
  "ledger",
  "skills",
  "net-read",
  "compile-check",
  "layout",
  "net-change",
  "experiment",
  "other",
] as const;

export type ToolCategory = (typeof toolCategories)[number];

const netReadTools = new Set<string>([
  getLatestNetDefinitionToolName,
  readPetrinautDocToolName,
  ...Object.values(netReaderToolNames),
]);

const layoutTools = new Set<string>([
  "applyAutoLayout",
  "commitNodePositions",
  "updatePlacePosition",
  "updateTransitionPosition",
  "updateComponentInstancePosition",
]);

export const toolCategoryOf = (toolName: string): ToolCategory => {
  if (
    toolName === brunchTools.ledgerCommit ||
    toolName === brunchTools.ledgerCompile
  ) {
    return "ledger";
  }
  if (
    toolName === brunchTools.activateSkill ||
    toolName === brunchTools.readSkillResource
  ) {
    return "skills";
  }
  if (netReadTools.has(toolName)) return "net-read";
  if (toolName === getNetCompilationErrorsToolName) return "compile-check";
  if (layoutTools.has(toolName)) return "layout";
  if (
    toolName === brunchTools.draftPetrinautExperiment ||
    toolName === createExperimentToolName
  ) {
    return "experiment";
  }
  if (Object.hasOwn(petrinautToolEffects, toolName)) return "net-change";
  return "other";
};
