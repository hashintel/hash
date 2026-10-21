import { useState, type ReactNode } from "react";

import { VoiceSessionContext } from "./context";
import { createVoiceSessionStore } from "./store";

export const VoiceSessionProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState(createVoiceSessionStore);

  return (
    <VoiceSessionContext.Provider value={store}>
      {children}
    </VoiceSessionContext.Provider>
  );
};
