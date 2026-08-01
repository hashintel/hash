import { createContext } from "react";

import type { AvatarSize, AvatarTone } from "../Avatar/avatar";

export type AvatarGroupContextValue = {
  size?: AvatarSize;
  tone?: AvatarTone;
};

/**
 * Lets an AvatarGroup pass its `size`/`tone` down to descendant Avatars that
 * don't set their own. Defaults to empty, so a standalone Avatar is unaffected.
 */
export const AvatarGroupContext = createContext<AvatarGroupContextValue>({});
