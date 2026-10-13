/**
 * The Petrinaut browser tools every Brunch agent mounts in a document-bound
 * conversation: the canonical catalogue, the filtered net readers and the
 * reviewed experiment draft, each executed through the browser-call rendezvous.
 * The agent's own guidance says when to use them; nothing is mounted here.
 */

import { useInitialData, useTool } from "@flue/runtime";

import { type SdcpnInitialData } from "@hashintel/brunch-agent";

import { createDraftExperimentTool } from "./petrinaut-tools/draft-experiment.ts";
import {
  asyncCanonicalPetrinautTools,
  netReaderTools,
  type BrowserToolExecutor,
} from "./petrinaut-tools/petrinaut-construction.ts";

type SdcpnToolOptions = {
  readonly executeBrowserTool?: BrowserToolExecutor;
  readonly authorizeDraft?: Parameters<
    typeof createDraftExperimentTool
  >[0]["authorizeDraft"];
};

/** Shared runtime capabilities, independent of the experimental guidance owner. */
export const usePetrinautTools = (options?: SdcpnToolOptions): void => {
  const initialData = useInitialData<SdcpnInitialData>();
  if (initialData) {
    if (!options?.authorizeDraft)
      throw new Error(
        "A document-bound conversation requires draft history authorization.",
      );
    if (!options.executeBrowserTool)
      throw new Error(
        "A document-bound conversation requires browser tool execution.",
      );
    useTool(
      createDraftExperimentTool({
        authorizeDraft: options.authorizeDraft,
        executeBrowserTool: options.executeBrowserTool,
      }),
    );
    for (const tool of asyncCanonicalPetrinautTools(options.executeBrowserTool))
      useTool(tool);
    for (const tool of netReaderTools(options.executeBrowserTool))
      useTool(tool);
  }
};
