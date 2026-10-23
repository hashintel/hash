import { createContext } from "react";

/**
 * Whether this panel's own stream delivered a tool call, so a widget may act
 * on it beyond rendering, as by claiming it. A call this panel only hydrated
 * or followed from history, which another panel's stream delivered, is
 * display-only; the panel's submit already refuses it. Outside a panel, every
 * call counts as delivered here.
 */
export const LocalToolCallAuthorityContext = createContext<
  (toolCallId: string) => boolean
>(() => true);
