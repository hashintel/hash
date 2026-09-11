import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";
import {
  petrinautDocNames,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core/ai";

export const READ_PETRINAUT_DOCS_TOOL_NAME = "read_petrinaut_docs";
/** @deprecated Use `READ_PETRINAUT_DOCS_TOOL_NAME`. */
export const READ_PETRINAUT_DOC_TOOL_NAME = READ_PETRINAUT_DOCS_TOOL_NAME;
export const LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME = readPetrinautDocToolName;

export const isReadPetrinautDocsToolName = (name: string): boolean =>
  name === READ_PETRINAUT_DOCS_TOOL_NAME ||
  name === LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME;

export const readPetrinautDocs = defineTool({
  name: READ_PETRINAUT_DOCS_TOOL_NAME,
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

/** @deprecated Use `readPetrinautDocs`. */
export const readPetrinautDoc = readPetrinautDocs;
