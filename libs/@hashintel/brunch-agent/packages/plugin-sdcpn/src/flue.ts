"use agent";
/**
 * The SDCPN plugin's agent composition. It mounts a packaged SKILL.md, so only
 * code built by Flue may import this entry; everything else lives on the main entry.
 */

import {
  useInitialData,
  useInstruction,
  useSkill,
  useTool,
} from "@flue/runtime";

import sdcpnModellingSkill from "@hashintel/brunch-agent-plugin-sdcpn/skills/sdcpn-modelling/SKILL.md";
import { brunchModes } from "@hashintel/brunch-agent/constants";
import { petrinautAiCapabilityGuidance } from "@hashintel/petrinaut-core/ai";

import { type SdcpnInitialData } from "./initial-data";
import sdcpnAppend from "./prompts/APPEND_SYSTEM.md?raw";
import { createDraftExperimentTool } from "./tools/draft-experiment";
import {
  canonicalPetrinautTools,
  asyncCanonicalPetrinautTools,
  type WorkpieceAuthorityOptions,
} from "./tools/petrinaut-construction";
import { readPetrinautDocs } from "./tools/read-petrinaut-doc";

export const useSdcpnPlugin = (
  options?: WorkpieceAuthorityOptions & {
    readonly executeCanonicalBrowserTool?: Parameters<
      typeof asyncCanonicalPetrinautTools
    >[0];
    readonly authorizeDraft?: Parameters<
      typeof createDraftExperimentTool
    >[0]["authorizeDraft"];
  },
): void => {
  const initialData = useInitialData<SdcpnInitialData>();
  if (initialData?.mode === brunchModes.stockOverFlue) {
    for (const tool of canonicalPetrinautTools) useTool(tool);
  } else if (initialData?.mode === brunchModes.integrated) {
    useInstruction(sdcpnAppend.trim());
    useInstruction(petrinautAiCapabilityGuidance);
    useSkill(sdcpnModellingSkill);
    if (!options?.authorizeDraft)
      throw new Error(
        "Integrated Brunch requires draft history authorization.",
      );
    useTool(
      createDraftExperimentTool({
        ...options,
        authorizeDraft: options.authorizeDraft,
      }),
    );
    useInstruction(
      "For Ledger-derived experiment proposals, prefer draft_petrinaut_experiment after a canonical getLatestNetDefinition read. Only call canonical createExperiment directly when the person explicitly requests immediate execution. Draft preparation is not execution; Run and Dismiss are editor-local human actions.",
    );
    for (const tool of options.executeCanonicalBrowserTool
      ? asyncCanonicalPetrinautTools(options.executeCanonicalBrowserTool)
      : canonicalPetrinautTools)
      useTool(tool);
  } else {
    // A conversation with no initial mode historically offers the skill and docs,
    // but no construction tools. Keep that route behavior.
    useInstruction(sdcpnAppend.trim());
    useSkill(sdcpnModellingSkill);
    useTool(readPetrinautDocs);
  }
};
