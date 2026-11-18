import { useState, type ReactNode } from "react";

import { VoiceSessionContext } from "./context";
import { createVoiceSessionStore } from "./store";

/** Brunch's Voice session store, for the chat it wraps and nothing outside it. */
export const VoiceSessionProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState(createVoiceSessionStore);

  return (
    <VoiceSessionContext.Provider value={store}>
      {children}
    </VoiceSessionContext.Provider>
  );
};
