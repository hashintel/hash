import {
  brunchTools,
  netReaderToolNames,
  petrinautToolEffects,
} from "@hashintel/brunch-agent";

/** What a tool call spends a step on, for turn-time accounting. */
export type ToolCategory =
  | "ledger"
  | "skills"
  | "net-read"
  | "compile-check"
  | "layout"
  | "net-change"
  | "experiment"
  | "other";

export const toolCategories: readonly ToolCategory[] = [
  "ledger",
  "skills",
  "net-read",
  "compile-check",
  "layout",
  "net-change",
  "experiment",
  "other",
];

const netReadTools = new Set<string>([
  "getLatestNetDefinition",
  "readPetrinautDoc",
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
  if (toolName === "getNetCompilationErrors") return "compile-check";
  if (layoutTools.has(toolName)) return "layout";
  if (
    toolName === brunchTools.draftPetrinautExperiment ||
    toolName === "createExperiment"
  ) {
    return "experiment";
  }
  if (Object.hasOwn(petrinautToolEffects, toolName)) return "net-change";
  return "other";
};
