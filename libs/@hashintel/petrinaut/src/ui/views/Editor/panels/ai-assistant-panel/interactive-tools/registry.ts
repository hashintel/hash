import type { AiToolOutput } from "../tool-summaries";
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
): InteractiveToolDefinition<unknown, AiToolOutput> | undefined => {
  const descriptor = interactiveTools[toolName];
  if (!descriptor) {
    return undefined;
  }
  return descriptor.shouldHandle(input) ? descriptor : undefined;
};
