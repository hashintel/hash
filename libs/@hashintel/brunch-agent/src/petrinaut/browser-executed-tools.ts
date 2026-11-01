import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { brunchTools } from "../constants";
import { draftPetrinautExperimentInputSchema } from "./draft-experiment";
import { netReaderToolNames, parseNetReaderInput } from "./net-readers";

/**
 * Every tool the server issues to the bound browser and awaits in band, by
 * the schema that parses its input: Petrinaut's canonical tools, the filtered
 * net readers and the reviewed experiment draft.
 */
export const browserExecutedToolInputSchemas: Readonly<
  Record<string, { readonly parse: (input: unknown) => unknown }>
> = {
  ...Object.fromEntries(
    Object.entries(petrinautAiTools).map(([name, tool]) => [
      name,
      tool.inputSchema,
    ]),
  ),
  ...Object.fromEntries(
    Object.values(netReaderToolNames).map((name) => [
      name,
      { parse: parseNetReaderInput },
    ]),
  ),
  [brunchTools.draftPetrinautExperiment]: draftPetrinautExperimentInputSchema,
};

export const browserExecutedToolNames: ReadonlySet<string> = new Set(
  Object.keys(browserExecutedToolInputSchemas),
);

/** The browser-executed tools Petrinaut runs on the net: all but the reviewed draft. */
export const browserNetToolNames: ReadonlySet<string> = new Set(
  [...browserExecutedToolNames].filter(
    (name) => name !== brunchTools.draftPetrinautExperiment,
  ),
);
