"use agent";
/**
 * The SDCPN plugin's Flue tools. Only code built by Flue imports this entry;
 * everything else lives on the main entry.
 */

import { useInitialData, useInstruction, useTool } from "@flue/runtime";

import { petrinautAiCapabilityGuidance } from "@hashintel/petrinaut-core/ai";

import { type SdcpnInitialData } from "./initial-data";
import { createDraftExperimentTool } from "./tools/draft-experiment";
import {
  asyncCanonicalPetrinautTools,
  netReaderTools,
  type BrowserToolExecutor,
} from "./tools/petrinaut-construction";

const experimentDraftingInstruction =
  "For experiment proposals, prefer draft_petrinaut_experiment after a canonical getLatestNetDefinition read. Only call canonical createExperiment directly when the person explicitly requests immediate execution; it carries no restrictions, so first name each restriction or threshold the person stated that the run will not enforce. Draft preparation is not execution; Run and Dismiss are editor-local human actions.";

type SdcpnToolOptions = {
  readonly executeBrowserTool?: BrowserToolExecutor;
  readonly authorizeDraft?: Parameters<
    typeof createDraftExperimentTool
  >[0]["authorizeDraft"];
  /** Replace the instructions mounted in a document-bound conversation; one left out mounts nothing. */
  readonly instructions?: {
    /** Mounted before the tools. */
    readonly capability?: string;
    /** Mounted after the experiment draft tool. */
    readonly experimentDrafting?: string;
  };
};

/** Shared runtime capabilities, independent of the experimental guidance owner. */
export const useSdcpnTools = (options?: SdcpnToolOptions): void => {
  const initialData = useInitialData<SdcpnInitialData>();
  if (initialData) {
    const instructions = options?.instructions ?? {
      capability: petrinautAiCapabilityGuidance,
      experimentDrafting: experimentDraftingInstruction,
    };
    if (instructions.capability !== undefined)
      useInstruction(instructions.capability);
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
    if (instructions.experimentDrafting !== undefined)
      useInstruction(instructions.experimentDrafting);
    for (const tool of asyncCanonicalPetrinautTools(options.executeBrowserTool))
      useTool(tool);
    for (const tool of netReaderTools(options.executeBrowserTool))
      useTool(tool);
  }
};
