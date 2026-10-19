import { getPetrinautAiInteractiveToolDefinition } from "../../interactive-tool";
import { applyAutoLayoutInteractiveTool } from "./apply-auto-layout-widget";

import type { PetrinautAiInteractiveTool } from "../../interactive-tool";
import type { AiToolOutput } from "../tool-summaries";
import type { InteractiveToolCall, InteractiveToolDefinition } from "./types";

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
  InteractiveToolDefinition<unknown, AiToolOutput>
> = {
  [applyAutoLayoutInteractiveTool.toolName]:
    applyAutoLayoutInteractiveTool as InteractiveToolDefinition<
      unknown,
      AiToolOutput
    >,
};

export const getInteractiveTool = (
  { toolName, toolCallId, input }: InteractiveToolCall,
  hostTools: readonly PetrinautAiInteractiveTool[] = [],
): InteractiveToolDefinition<unknown, unknown> | undefined => {
  const builtInDescriptor = interactiveTools[toolName];
  const matchingHostTools = hostTools.filter(
    (tool) => tool.toolName === toolName,
  );

  if (matchingHostTools.length > 1) {
    throw new Error(
      `Interactive AI tool registered more than once: ${toolName}`,
    );
  }
  if (builtInDescriptor && matchingHostTools.length > 0) {
    throw new Error(
      `Host interactive AI tool conflicts with a built-in tool: ${toolName}`,
    );
  }

  const hostDefinition = matchingHostTools[0]
    ? getPetrinautAiInteractiveToolDefinition(matchingHostTools[0])
    : undefined;
  const descriptor: InteractiveToolDefinition<unknown, unknown> | undefined =
    builtInDescriptor
      ? (builtInDescriptor as unknown as InteractiveToolDefinition<
          unknown,
          unknown
        >)
      : hostDefinition
        ? {
            toolName: hostDefinition.toolName,
            placement: hostDefinition.placement,
            shouldHandle: (_input, call) =>
              hostDefinition.shouldHandle?.(call) ?? true,
            parseInput: hostDefinition.parseInput,
            parseOutput: hostDefinition.parseOutput,
            fromComposerText: hostDefinition.fromComposerText,
            Widget: hostDefinition.component,
          }
        : undefined;
  if (!descriptor) {
    return undefined;
  }
  return descriptor.shouldHandle(input, { toolCallId })
    ? descriptor
    : undefined;
};

/** Resolve a dynamic call only when the host explicitly registered its name. */
export const resolveDynamicInteractiveTool = (
  call: InteractiveToolCall,
  hostTools: readonly PetrinautAiInteractiveTool[],
): InteractiveToolDefinition<unknown, unknown> => {
  if (!hostTools.some((tool) => tool.toolName === call.toolName)) {
    throw new Error(`Unknown AI tool: ${call.toolName}`);
  }

  const descriptor = getInteractiveTool(call, hostTools);
  if (!descriptor) {
    throw new Error(
      `AI tool ${call.toolName} was declined by the host for call ${call.toolCallId}`,
    );
  }

  descriptor.parseInput(call.input);
  return descriptor;
};
