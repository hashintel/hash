import type { SDCPN } from "../types/sdcpn";

/**
 * Makes `target` hold `definition`'s fields and no other, in place: the
 * whole document replaced within one change of its handle.
 */
export const replaceDefinition = (target: SDCPN, definition: SDCPN): void => {
  const draft = target as Record<string, unknown>;
  const next = definition as Record<string, unknown>;
  for (const key of Object.keys(draft)) {
    if (next[key] === undefined) {
      delete draft[key];
    }
  }
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) {
      draft[key] = value;
    }
  }
};
