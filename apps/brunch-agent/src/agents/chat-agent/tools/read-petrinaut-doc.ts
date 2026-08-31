import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import {
  petrinautDocNames,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core/ai";

import { AWAITING_CLIENT } from "../../../client-tool.ts";

export const READ_PETRINAUT_DOC_TOOL_NAME = readPetrinautDocToolName;

export const readPetrinautDoc = defineTool({
  name: READ_PETRINAUT_DOC_TOOL_NAME,
  description:
    "Read one page of the Petrinaut user guide. The browser executes this tool. After you call it, wait for a client-tool-result signal carrying the page text, then continue from that text.",
  input: v.object({
    doc: v.picklist(petrinautDocNames),
  }),
  output: v.object({
    awaiting: v.literal(AWAITING_CLIENT),
  }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});
