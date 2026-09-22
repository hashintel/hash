import { applyPetrinautConstructionToolName } from "@hashintel/brunch-agent-plugin-sdcpn";
import { petrinautAiTools } from "@hashintel/petrinaut-core";

/** Literal stock catalogue handled by Petrinaut's existing static panel tools. */
export const canonicalPetrinautClientToolNames: ReadonlySet<string> = new Set(
  Object.keys(petrinautAiTools),
);

/** Interface B adds one host-owned deep tool without replacing stock tools. */
export const deepPetrinautClientToolNames: ReadonlySet<string> = new Set([
  ...canonicalPetrinautClientToolNames,
  applyPetrinautConstructionToolName,
]);
