import { draftPetrinautExperimentToolName } from "@hashintel/brunch-agent-plugin-sdcpn";
import { petrinautAiTools } from "@hashintel/petrinaut-core";

/** Literal stock catalogue handled by Petrinaut's existing static panel tools. */
export const canonicalPetrinautClientToolNames: ReadonlySet<string> = new Set(
  Object.keys(petrinautAiTools),
);

/** Integrated Brunch adds a distinct reviewed draft without replacing stock tools. */
export const integratedPetrinautClientToolNames: ReadonlySet<string> = new Set([
  ...canonicalPetrinautClientToolNames,
  draftPetrinautExperimentToolName,
]);
