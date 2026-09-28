import { brunchTools } from "@hashintel/brunch-agent";
import {
  netReaderToolNames,
  petrinautToolEffects,
  type PetrinautToolCapability,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  petrinautAiTools,
  type PetrinautAiToolName,
} from "@hashintel/petrinaut-core/ai";

export type ToolDefinitionOwner =
  | "flue"
  | "brunch-core"
  | "sdcpn-plugin"
  | "petrinaut-core"
  | "brunch-app";

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
  canonicalNames: readonly string[] = Object.keys(petrinautAiTools),
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

export const canonicalPetrinautToolCatalogue = Object.keys(
  petrinautAiTools,
).map(
  (name): BrunchToolCatalogueEntry => ({
    name,
    definitionOwner: "petrinaut-core",
    executionOwner: "petrinaut-website",
    capability: petrinautToolEffects[name as PetrinautAiToolName].capability,
  }),
);

const netReaderTools: readonly BrunchToolCatalogueEntry[] = Object.values(
  netReaderToolNames,
).map((name) => ({
  name,
  definitionOwner: "sdcpn-plugin",
  executionOwner: "petrinaut-website",
  capability: "petrinaut-read",
}));

const draftBrunchTool: BrunchToolCatalogueEntry = {
  name: brunchTools.draftPetrinautExperiment,
  definitionOwner: "sdcpn-plugin",
  executionOwner: "petrinaut-website",
  capability: "petrinaut-experiment-draft",
};

/**
 * Expected provider-visible names and ownership for a document-bound Brunch conversation.
 * Schemas stay with Petrinaut; this list deliberately classifies names only.
 */
export const brunchToolCatalogue: readonly BrunchToolCatalogueEntry[] = [
  {
    name: "task",
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
    definitionOwner: "brunch-core",
    executionOwner: "brunch-app",
    capability: "ledger",
  },
  {
    name: brunchTools.ledgerCompile,
    definitionOwner: "brunch-core",
    executionOwner: "brunch-app",
    capability: "ledger",
  },
  {
    name: brunchTools.queryWorkpiece,
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

/** Tools the bound browser executes; the server awaits each result in band. */
export const inBandBrowserToolNames: ReadonlySet<string> = new Set(
  brunchToolCatalogue
    .filter(({ executionOwner }) => executionOwner === "petrinaut-website")
    .map(({ name }) => name),
);
