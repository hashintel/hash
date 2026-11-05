import { createContext } from "react";

import { createVoiceSessionStore } from "./store";

/**
 * Falls back to a detached store so surfaces rendered outside a provider
 * (Storybook, unit tests) simply see no session instead of throwing.
 */
export const VoiceSessionContext = createContext(createVoiceSessionStore());
