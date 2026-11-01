import {
  browserExecutedToolNames,
  brunchTools,
  CANONICAL_PETRINAUT_TOOL_NAMES,
  netReaderToolNames,
  type PetrinautToolCapability,
  petrinautToolEffects,
} from "@hashintel/brunch-agent";

export type ToolDefinitionOwner = "flue" | "petrinaut-core" | "brunch-app";

export type ToolExecutionOwner = "flue" | "brunch-app" | "petrinaut-website";

export type ToolCapabilityClass =
  | "substrate"
  | "ledger"
  | PetrinautToolCapability
  | "petrinaut-experiment-draft"
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
];

/** The catalogue's website-executed entries are exactly the tools the library says the browser runs. */
export const assertBrowserExecutedToolConformance = (
  catalogue: readonly BrunchToolCatalogueEntry[] = brunchToolCatalogue,
): void => {
  const catalogued = catalogue
    .filter(({ executionOwner }) => executionOwner === "petrinaut-website")
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
