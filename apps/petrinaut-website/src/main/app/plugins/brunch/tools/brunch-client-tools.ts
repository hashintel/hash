import { netReaderToolNames } from "@hashintel/brunch-agent-plugin-sdcpn";
import { brunchTools } from "@hashintel/brunch-agent/constants";
import { petrinautAiTools } from "@hashintel/petrinaut-core";

/** Literal stock catalogue handled by Petrinaut's existing static panel tools. */
export const canonicalPetrinautClientToolNames: ReadonlySet<string> = new Set(
  Object.keys(petrinautAiTools),
);

/** Brunch adds filtered net readers and a reviewed draft without replacing stock tools. */
export const brunchPetrinautClientToolNames: ReadonlySet<string> = new Set([
  ...canonicalPetrinautClientToolNames,
  ...Object.values(netReaderToolNames),
  brunchTools.draftPetrinautExperiment,
]);
