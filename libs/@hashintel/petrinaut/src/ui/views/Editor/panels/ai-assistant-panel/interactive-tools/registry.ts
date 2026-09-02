import { getPetrinautAiInteractiveToolDefinition } from "../../../../../types/ai-interactive-tool";
import { applyAutoLayoutInteractiveTool } from "./apply-auto-layout-widget";

import type { PetrinautAiInteractiveTool } from "../../../../../types/ai-interactive-tool";
import type { AiToolOutput } from "../tool-summaries";
import type { InteractiveToolDefinition } from "./types";

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
  toolName: string,
  input: unknown,
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
            shouldHandle: () => true,
            parseInput: hostDefinition.parseInput,
            parseOutput: hostDefinition.parseOutput,
            fromComposerText: hostDefinition.fromComposerText,
            supportsSubmittedOutputPrefix:
              hostDefinition.supportsSubmittedOutputPrefix,
            Widget: hostDefinition.component,
          }
        : undefined;
  if (!descriptor) {
    return undefined;
  }
  return descriptor.shouldHandle(input) ? descriptor : undefined;
};

/** Resolve a dynamic call only when the host explicitly registered its name. */
export const resolveDynamicInteractiveTool = (
  toolName: string,
  input: unknown,
  hostTools: readonly PetrinautAiInteractiveTool[],
): InteractiveToolDefinition<unknown, unknown> => {
  if (!hostTools.some((tool) => tool.toolName === toolName)) {
    throw new Error(`Unknown AI tool: ${toolName}`);
  }

  const descriptor = getInteractiveTool(toolName, input, hostTools);
  if (!descriptor) {
    throw new Error(`Unknown AI tool: ${toolName}`);
  }

  descriptor.parseInput(input);
  return descriptor;
};
