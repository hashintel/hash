import { useState, type ReactNode } from "react";

import { VoiceSessionContext } from "./context";
import { createVoiceSessionStore } from "./store";

/**
 * @deprecated Part of the built-in AI chat. Provide the assistant with a
 * plugin that declares `assistant`, which renders its own chat.
 */
export const VoiceSessionProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState(createVoiceSessionStore);

  return (
    <VoiceSessionContext.Provider value={store}>
      {children}
    </VoiceSessionContext.Provider>
  );
};
