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
import { petrinautAiCapabilityGuidance } from "@hashintel/petrinaut-core/ai";

import { type SdcpnInitialData } from "./initial-data";
import {
  interviewBudgetInstruction,
  type InterviewBudget,
} from "./interview-budget";
import sdcpnAppend from "./prompts/APPEND_SYSTEM.md?raw";
import { createDraftExperimentTool } from "./tools/draft-experiment";
import {
  asyncCanonicalPetrinautTools,
  type BrowserToolExecutor,
} from "./tools/petrinaut-construction";

export const useSdcpnPlugin = (options?: {
  /** Current delivery overrides creation-only initialData, including Off. */
  readonly interviewBudget?: InterviewBudget;
  readonly executeBrowserTool?: BrowserToolExecutor;
  readonly authorizeDraft?: Parameters<
    typeof createDraftExperimentTool
  >[0]["authorizeDraft"];
}): void => {
  const initialData = useInitialData<SdcpnInitialData>();
  const instruction = interviewBudgetInstruction(
    options && "interviewBudget" in options
      ? options.interviewBudget
      : initialData?.interviewBudget,
  );
  if (instruction) useInstruction(instruction);
  if (initialData) {
    useInstruction(sdcpnAppend.trim());
    useInstruction(petrinautAiCapabilityGuidance);
    useSkill(sdcpnModellingSkill);
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
    useInstruction(
      "For experiment proposals, prefer draft_petrinaut_experiment after a canonical getLatestNetDefinition read. Only call canonical createExperiment directly when the person explicitly requests immediate execution; it carries no restrictions, so first name each restriction or threshold the person stated that the run will not enforce. Draft preparation is not execution; Run and Dismiss are editor-local human actions.",
    );
    for (const tool of asyncCanonicalPetrinautTools(options.executeBrowserTool))
      useTool(tool);
  } else {
    // A conversation with no document binding offers the instruction and skill only.
    useInstruction(sdcpnAppend.trim());
    useSkill(sdcpnModellingSkill);
  }
};
