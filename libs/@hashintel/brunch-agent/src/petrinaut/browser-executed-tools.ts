import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { brunchTools } from "../constants";
import { draftPetrinautExperimentInputSchema } from "./draft-experiment";
import { netReaderToolNames, parseNetReaderInput } from "./net-readers";

/**
 * Every tool the server issues to the bound browser and awaits in band, by
 * the schema that parses its input: Petrinaut's canonical tools, the filtered
 * net readers, the reviewed experiment draft and HASH's entity read.
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
  // The HASH agent owns this read's schema. It has no defaults or transforms,
  // so the input the server issues is the model's, and both sides compare it
  // as it is.
  [brunchTools.queryHashEntities]: { parse: (input: unknown) => input },
};

export const browserExecutedToolNames: ReadonlySet<string> = new Set(
  Object.keys(browserExecutedToolInputSchemas),
);

/**
 * The browser-executed tools Petrinaut runs on the net: all but the reviewed
 * draft and HASH's entity read, which reads the graph rather than the net.
 */
export const browserNetToolNames: ReadonlySet<string> = new Set(
  [...browserExecutedToolNames].filter(
    (name) =>
      name !== brunchTools.draftPetrinautExperiment &&
      name !== brunchTools.queryHashEntities,
  ),
);
