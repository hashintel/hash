import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";
import {
  petrinautAiTools,
  petrinautDocNames,
  petrinautDocSummaries,
} from "@hashintel/petrinaut-core/ai";

import { READ_PETRINAUT_DOCS_TOOL_NAME } from "../construction-tool-names";

export {
  READ_PETRINAUT_DOCS_TOOL_NAME,
  isReadPetrinautDocsToolName,
} from "../construction-tool-names";

export const readPetrinautDocs = defineTool({
  name: READ_PETRINAUT_DOCS_TOOL_NAME,
  description: `${petrinautAiTools.readPetrinautDoc.description}\nThe browser executes this tool. Call it in its own proposal and wait for the client-tool-result page text, then continue. Choose a page by its scope:\n${petrinautDocNames.map((name) => `- ${name}: ${petrinautDocSummaries[name]}`).join("\n")}`,
  input: petrinautAiTools.readPetrinautDoc.inputSchema,
  output: v.object({
    awaiting: v.literal(AWAITING_CLIENT),
  }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});

/** @deprecated Use `readPetrinautDocs`. */
export const readPetrinautDoc = readPetrinautDocs;
