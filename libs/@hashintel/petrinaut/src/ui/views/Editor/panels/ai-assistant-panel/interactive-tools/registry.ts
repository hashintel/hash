import { applyAutoLayoutInteractiveTool } from "./apply-auto-layout-widget";

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
  InteractiveToolDefinition<unknown, unknown>
> = {
  [applyAutoLayoutInteractiveTool.toolName]:
    applyAutoLayoutInteractiveTool as InteractiveToolDefinition<
      unknown,
      unknown
    >,
};

export const findHostInteractiveTool = (
  toolName: string,
  hostTools: readonly InteractiveToolDefinition<unknown, unknown>[] = [],
): InteractiveToolDefinition<unknown, unknown> | undefined => {
  if (interactiveTools[toolName]) {
    return undefined;
  }
  return hostTools.find((hostTool) => hostTool.toolName === toolName);
};

export const getHostInteractiveTool = (
  toolName: string,
  input: unknown,
  hostTools: readonly InteractiveToolDefinition<unknown, unknown>[] = [],
): InteractiveToolDefinition<unknown, unknown> | undefined => {
  const descriptor = findHostInteractiveTool(toolName, hostTools);
  if (!descriptor) {
    return undefined;
  }
  return descriptor.shouldHandle(input) ? descriptor : undefined;
};

export const getInteractiveTool = (
  toolName: string,
  input: unknown,
  hostTools: readonly InteractiveToolDefinition<unknown, unknown>[] = [],
): InteractiveToolDefinition<unknown, unknown> | undefined => {
  const descriptor =
    interactiveTools[toolName] ??
    getHostInteractiveTool(toolName, input, hostTools);
  if (!descriptor) {
    return undefined;
  }
  return descriptor.shouldHandle(input) ? descriptor : undefined;
};
