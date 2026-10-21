import { applyAutoLayoutInteractiveTool } from "./apply-auto-layout-widget";

import type { AiToolOutput } from "../tool-summaries";
import type { InteractiveToolCall, InteractiveToolDefinition } from "./types";

/**
 * Registry of AI tools that require an inline chat widget for user input.
 *
 * The chat consults this map before it runs a command: when a tool name has a
 * matching descriptor whose {@link InteractiveToolDefinition.shouldHandle}
 * returns `true`, the chat leaves the call pending instead of running it, and
 * the transcript renders the registered widget. Once the user interacts with
 * the widget, the transcript calls the chat's `onInteractiveToolSubmit` to
 * commit a tool output.
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

/** The widget a tool call waits on, or `undefined` when the call runs directly. */
export const getInteractiveTool = ({
  toolName,
  toolCallId,
  input,
}: InteractiveToolCall):
  | InteractiveToolDefinition<unknown, unknown>
  | undefined => {
  const descriptor = interactiveTools[toolName] as
    | InteractiveToolDefinition<unknown, unknown>
    | undefined;

  return descriptor?.shouldHandle(input, { toolCallId })
    ? descriptor
    : undefined;
};
