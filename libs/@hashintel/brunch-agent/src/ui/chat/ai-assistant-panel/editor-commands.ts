import {
  setNetTitleToolInputSchema,
  type AiCommandActionName,
  type ApplyAutoLayoutResult,
} from "@hashintel/petrinaut-core";
import {
  describeRefusal,
  type EditResult,
  type PluginDocument,
} from "@hashintel/petrinaut/ui/plugin";

import {
  type AiToolCall,
  type AiToolOutput,
  summarizeApplyAutoLayout,
  toBlockedOutput,
  toPetrinautAiToolOutput,
} from "./tool-summaries";

/**
 * Renames the net through the plugin, which refuses without a host title
 * setter or while the editor is read-only; the refusal is the output.
 */
export const executeSetNetTitle = ({
  input,
  document,
}: {
  readonly input: unknown;
  readonly document: Pick<PluginDocument, "title" | "setTitle">;
}): AiToolOutput => {
  const { title } = setNetTitleToolInputSchema.parse(input);
  const previousTitle = document.title.get();
  const renamed = document.setTitle(title);
  if (!renamed.applied) {
    return renamed.reason.kind === "no-title-setter"
      ? { applied: false, reason: describeRefusal(renamed.reason) }
      : toBlockedOutput(renamed.reason);
  }
  return {
    applied: true,
    title: `Renamed net to "${title}"`,
    detail:
      previousTitle && previousTitle !== title
        ? `Previous title: ${previousTitle}`
        : undefined,
  };
};

/** Runs one AI command through the plugin's edits, which refuse while read-only. */
export const applyPetrinautAiCommand = async ({
  aiToolCall,
  applyAutoLayout,
}: {
  aiToolCall: Extract<AiToolCall, { toolName: AiCommandActionName }>;
  /** The plugin's layout edit, which frames the result once drawn. */
  applyAutoLayout: () => Promise<EditResult<ApplyAutoLayoutResult>>;
}): Promise<AiToolOutput> => {
  // Exhaustive switch over AiCommandActionName — extending the AI command
  // surface will surface a TypeScript error here until the new case is added.
  switch (aiToolCall.toolName) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case "applyAutoLayout": {
      const result = await applyAutoLayout();
      if (!result.applied) {
        return toBlockedOutput(result.reason);
      }
      return toPetrinautAiToolOutput(
        summarizeApplyAutoLayout({ commitCount: result.value.commitCount }),
      );
    }
    default: {
      const unhandledToolName: never = aiToolCall.toolName;
      return unhandledToolName;
    }
  }
};
