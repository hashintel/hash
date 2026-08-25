import { applyAutoLayoutInteractiveTool } from "./apply-auto-layout-widget";

import type {
  ApplyAutoLayoutDecision,
  ApplyAutoLayoutResult,
} from "./apply-auto-layout-widget";
import type {
  InteractiveToolDefinition,
  PetrinautAiInteractiveTool,
} from "./types";
import type { AiCommandActionName } from "@hashintel/petrinaut-core";

/**
 * Registry of AI tools that require an inline chat widget for user input.
 *
 * The AI dispatcher consults this map in `onToolCall`: when a tool name has a
 * matching descriptor whose {@link InteractiveToolDefinition.shouldHandle}
 * returns `true`, the dispatcher stores the call as pending instead of
 * invoking the writable callback, and the AI surface renders the registered
 * widget. Once the user interacts with the widget, the surface calls the
 * dispatcher's `onInteractiveToolSubmit` to commit a tool output to the chat.
 */
export const interactiveTools: Record<
  string,
  InteractiveToolDefinition<
    unknown,
    ApplyAutoLayoutDecision,
    ApplyAutoLayoutResult,
    AiCommandActionName
  >
> = {
  [applyAutoLayoutInteractiveTool.toolName]:
    applyAutoLayoutInteractiveTool as InteractiveToolDefinition<
      unknown,
      ApplyAutoLayoutDecision,
      ApplyAutoLayoutResult,
      AiCommandActionName
    >,
};

export type ResolvedInteractiveTool =
  | {
      readonly kind: "petrinaut";
      readonly definition: InteractiveToolDefinition<
        unknown,
        ApplyAutoLayoutDecision,
        ApplyAutoLayoutResult,
        AiCommandActionName
      >;
    }
  | {
      readonly kind: "host";
      readonly tool: PetrinautAiInteractiveTool;
    };

export const findHostInteractiveTool = (
  toolName: string,
  hostTools: readonly PetrinautAiInteractiveTool[] = [],
): PetrinautAiInteractiveTool | undefined => {
  if (interactiveTools[toolName]) {
    return undefined;
  }
  return hostTools.find((hostTool) => hostTool.toolName === toolName);
};

export const getHostInteractiveTool = (
  toolName: string,
  input: unknown,
  hostTools: readonly PetrinautAiInteractiveTool[] = [],
): PetrinautAiInteractiveTool | undefined => {
  const descriptor = findHostInteractiveTool(toolName, hostTools);
  if (!descriptor) {
    return undefined;
  }
  return descriptor.shouldHandle(input) ? descriptor : undefined;
};

export const getInteractiveTool = (
  toolName: string,
  input: unknown,
  hostTools: readonly PetrinautAiInteractiveTool[] = [],
): ResolvedInteractiveTool | undefined => {
  const petrinautDefinition = interactiveTools[toolName];
  if (petrinautDefinition?.shouldHandle(input)) {
    return { kind: "petrinaut", definition: petrinautDefinition };
  }
  const hostTool = getHostInteractiveTool(toolName, input, hostTools);
  return hostTool ? { kind: "host", tool: hostTool } : undefined;
};
