export type ToolDefinitionOwner =
  | "flue"
  | "brunch-core"
  | "sdcpn-plugin"
  | "petrinaut-core"
  | "brunch-app";

export type ToolExecutionOwner = "flue" | "brunch-app" | "petrinaut-website";

export interface OrdinaryBrunchToolCatalogueEntry {
  readonly name: string;
  readonly definitionOwner: ToolDefinitionOwner;
  readonly executionOwner: ToolExecutionOwner;
  readonly role:
    | "substrate"
    | "workpiece"
    | "petrinaut-read"
    | "petrinaut-mutation"
    | "explanation"
    | "diagnostic";
}

/**
 * Checked map of the tools mounted for ordinary browser-bound Brunch.
 *
 * Schemas remain with their definition owners; this list records only names,
 * roles and execution boundaries. Native provider carriage tests compare the
 * live mounted set with this catalogue.
 */
export const ordinaryBrunchToolCatalogue: readonly OrdinaryBrunchToolCatalogueEntry[] =
  [
    {
      name: "task",
      definitionOwner: "flue",
      executionOwner: "flue",
      role: "substrate",
    },
    {
      name: "activate_skill",
      definitionOwner: "flue",
      executionOwner: "flue",
      role: "substrate",
    },
    {
      name: "read_skill_resource",
      definitionOwner: "flue",
      executionOwner: "flue",
      role: "substrate",
    },
    {
      name: "brunch_mark_question",
      definitionOwner: "brunch-core",
      executionOwner: "brunch-app",
      role: "workpiece",
    },
    {
      name: "mutate_workpiece",
      definitionOwner: "brunch-core",
      executionOwner: "brunch-app",
      role: "workpiece",
    },
    {
      name: "readPetrinautDoc",
      definitionOwner: "petrinaut-core",
      executionOwner: "petrinaut-website",
      role: "petrinaut-read",
    },
    {
      name: "getLatestNetDefinition",
      definitionOwner: "petrinaut-core",
      executionOwner: "petrinaut-website",
      role: "petrinaut-read",
    },
    {
      name: "getNetCompilationErrors",
      definitionOwner: "petrinaut-core",
      executionOwner: "petrinaut-website",
      role: "petrinaut-read",
    },
    {
      name: "applyAutoLayout",
      definitionOwner: "petrinaut-core",
      executionOwner: "petrinaut-website",
      role: "petrinaut-mutation",
    },
    {
      name: "mutate_petrinet",
      definitionOwner: "sdcpn-plugin",
      executionOwner: "petrinaut-website",
      role: "petrinaut-mutation",
    },
    {
      name: "read_workpiece",
      definitionOwner: "brunch-core",
      executionOwner: "brunch-app",
      role: "workpiece",
    },
    {
      name: "query_workpiece",
      definitionOwner: "brunch-app",
      executionOwner: "brunch-app",
      role: "explanation",
    },
    {
      name: "ping",
      definitionOwner: "brunch-app",
      executionOwner: "brunch-app",
      role: "diagnostic",
    },
  ];
