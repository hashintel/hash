import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { awaitingClient, brunchTools } from "@hashintel/brunch-agent/constants";
import {
  petrinautAiTools,
  petrinautDocNames,
  petrinautDocSummaries,
} from "@hashintel/petrinaut-core/ai";

export const readPetrinautDocs = defineTool({
  name: brunchTools.readPetrinautDocs,
  description: `${petrinautAiTools.readPetrinautDoc.description}\nThe browser executes this tool. Call it in its own proposal and wait for the client-tool-result page text, then continue. Choose a page by its scope:\n${petrinautDocNames.map((name) => `- ${name}: ${petrinautDocSummaries[name]}`).join("\n")}`,
  input: petrinautAiTools.readPetrinautDoc.inputSchema,
  output: v.object({
    awaiting: v.literal(awaitingClient),
  }),
  run() {
    return { output: { awaiting: awaitingClient }, terminate: true };
  },
});
