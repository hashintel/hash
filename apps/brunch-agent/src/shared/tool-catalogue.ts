import {
  browserExecutedToolNames,
  brunchTools,
  CANONICAL_PETRINAUT_TOOL_NAMES,
  hashGraphReadToolNames,
  netReaderToolNames,
  type PetrinautToolCapability,
  petrinautToolEffects,
} from "@hashintel/brunch-agent";

export type ToolDefinitionOwner = "flue" | "petrinaut-core" | "brunch-app";

export type ToolExecutionOwner =
  | "flue"
  | "brunch-app"
  | "petrinaut-website"
  | "hash-frontend";

/** Owners that run a tool in the bound browser, in band. */
const browserExecutionOwners: ReadonlySet<ToolExecutionOwner> = new Set([
  "petrinaut-website",
  "hash-frontend",
]);

export type ToolCapabilityClass =
  | "substrate"
  | "ledger"
  | PetrinautToolCapability
  | "petrinaut-experiment-draft"
  | "hash-read"
  | "hash-save"
  | "explanation"
  | "diagnostic";

export interface BrunchToolCatalogueEntry {
  readonly name: string;
  readonly definitionOwner: ToolDefinitionOwner;
  readonly executionOwner: ToolExecutionOwner;
  readonly capability: ToolCapabilityClass;
}

export const assertPetrinautToolCatalogueConformance = (
  canonicalNames: readonly string[] = CANONICAL_PETRINAUT_TOOL_NAMES,
): void => {
  const classifiedNames = Object.keys(petrinautToolEffects);
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

export const canonicalPetrinautToolCatalogue =
  CANONICAL_PETRINAUT_TOOL_NAMES.map((name): BrunchToolCatalogueEntry => ({
    name,
    definitionOwner: "petrinaut-core",
    executionOwner: "petrinaut-website",
    capability: petrinautToolEffects[name].capability,
  }));

const netReaderTools: readonly BrunchToolCatalogueEntry[] = Object.values(
  netReaderToolNames,
).map((name) => ({
  name,
  definitionOwner: "brunch-app",
  executionOwner: "petrinaut-website",
  capability: "petrinaut-read",
}));

const draftBrunchTool: BrunchToolCatalogueEntry = {
  name: brunchTools.draftPetrinautExperiment,
  definitionOwner: "brunch-app",
  executionOwner: "petrinaut-website",
  capability: "petrinaut-experiment-draft",
};

/** HASH's process page runs them; only the HASH agent mounts them. */
const hashGraphReadTools: readonly BrunchToolCatalogueEntry[] = [
  ...hashGraphReadToolNames,
].map((name) => ({
  name,
  definitionOwner: "brunch-app",
  executionOwner: "hash-frontend",
  capability: "hash-read",
}));

/** HASH's process page saves through its editor's Save; only the HASH agent mounts it. */
const hashSaveTool: BrunchToolCatalogueEntry = {
  name: brunchTools.saveHashNet,
  definitionOwner: "brunch-app",
  executionOwner: "hash-frontend",
  capability: "hash-save",
};

/**
 * Expected provider-visible names and ownership for a document-bound Brunch conversation.
 * Schemas stay with Petrinaut; this list deliberately classifies names only.
 */
export const brunchToolCatalogue: readonly BrunchToolCatalogueEntry[] = [
  {
    name: brunchTools.task,
    definitionOwner: "flue",
    executionOwner: "flue",
    capability: "substrate",
  },
  {
    name: brunchTools.activateSkill,
    definitionOwner: "flue",
    executionOwner: "flue",
    capability: "substrate",
  },
  {
    name: brunchTools.readSkillResource,
    definitionOwner: "flue",
    executionOwner: "flue",
    capability: "substrate",
  },
  {
    name: brunchTools.ledgerCommit,
    definitionOwner: "brunch-app",
    executionOwner: "brunch-app",
    capability: "ledger",
  },
  {
    name: brunchTools.ledgerCompile,
    definitionOwner: "brunch-app",
    executionOwner: "brunch-app",
    capability: "ledger",
  },
  {
    name: brunchTools.queryBasis,
    definitionOwner: "brunch-app",
    executionOwner: "brunch-app",
    capability: "explanation",
  },
  {
    name: brunchTools.ping,
    definitionOwner: "brunch-app",
    executionOwner: "brunch-app",
    capability: "diagnostic",
  },
  ...canonicalPetrinautToolCatalogue,
  ...netReaderTools,
  draftBrunchTool,
  ...hashGraphReadTools,
  hashSaveTool,
];

/** The catalogue's browser-executed entries are exactly the tools the library says the browser runs. */
export const assertBrowserExecutedToolConformance = (
  catalogue: readonly BrunchToolCatalogueEntry[] = brunchToolCatalogue,
): void => {
  const catalogued = catalogue
    .filter(({ executionOwner }) => browserExecutionOwners.has(executionOwner))
    .map(({ name }) => name);
  const missing = [...browserExecutedToolNames].filter(
    (name) => !catalogued.includes(name),
  );
  const extra = catalogued.filter(
    (name) => !browserExecutedToolNames.has(name),
  );
  if (missing.length > 0 || extra.length > 0)
    throw new Error(
      `Browser-executed tool mismatch (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}).`,
    );
};

assertBrowserExecutedToolConformance();
