import { browserExecutedToolNames } from "@hashintel/brunch-agent";
import { petrinautAiTools } from "@hashintel/petrinaut-core";

/** Literal stock catalogue handled by Petrinaut's existing static panel tools. */
export const canonicalPetrinautClientToolNames: ReadonlySet<string> = new Set(
  Object.keys(petrinautAiTools),
);

/** Brunch adds filtered net readers and a reviewed draft without replacing stock tools. */
export const brunchPetrinautClientToolNames: ReadonlySet<string> =
  browserExecutedToolNames;
