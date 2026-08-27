import { defineTool } from "@flue/runtime";
import * as v from "valibot";

export const READ_PETRINAUT_DOC_TOOL_NAME = "readPetrinautDoc";

export const readPetrinautDoc = defineTool({
  name: READ_PETRINAUT_DOC_TOOL_NAME,
  description:
    "Read one page of the Petrinaut user guide. The browser executes this tool. After you call it, wait for a client-tool-result signal carrying the page text, then continue from that text.",
  input: v.object({
    doc: v.pipe(v.string(), v.nonEmpty()),
  }),
  output: v.object({
    awaiting: v.literal("client"),
  }),
  run() {
    return { output: { awaiting: "client" as const }, terminate: true };
  },
});
