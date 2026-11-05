import { createContext } from "react";

export type LocalToolCallAuthority = {
  /**
   * Whether this panel's own stream delivered a tool call, so a widget may act
   * on it beyond rendering, as by claiming it. A call this panel only hydrated
   * or followed from history, which another panel's stream delivered, is
   * display-only; the panel's submit already refuses it. Read from effects,
   * never during render.
   */
  deliveredHere: (toolCallId: string) => boolean;
  /**
   * Advances each time the panel's stream delivers a call. A widget whose
   * call was not yet delivered when its effect last ran lists this in that
   * effect's dependencies, so the effect asks `deliveredHere` again once the
   * delivery is recorded.
   */
  deliveries: number;
};

/** Outside a panel, every call counts as delivered here. */
export const LocalToolCallAuthorityContext =
  createContext<LocalToolCallAuthority>({
    deliveredHere: () => true,
    deliveries: 0,
  });
