import { use, useEffect, useRef, type FC, type PropsWithChildren } from "react";

import {
  CanvasViewportContext,
  type CanvasViewport,
} from "./canvas-viewport-context";
import { SDCPNContext } from "./sdcpn-context";
import { UserSettingsContext } from "./user-settings-context";

/** Pan and zoom report many times a second; one write per pause is enough. */
const saveDelayMs = 250;

type PendingSave = {
  petriNetId: string;
  viewport: CanvasViewport;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Keeps the canvas viewport per document in the user settings, so a net
 * reopens where it was left, whether after switching documents or reloading.
 */
export const CanvasViewportProvider: FC<PropsWithChildren> = ({ children }) => {
  const { petriNetId } = use(SDCPNContext);
  const { canvasViewports, setCanvasViewport } = use(UserSettingsContext);
  const pendingRef = useRef<PendingSave | null>(null);

  const flush = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    setCanvasViewport(pending.petriNetId, pending.viewport);
  };

  const rememberViewport = (viewport: CanvasViewport) => {
    if (!petriNetId) return;
    const pending = pendingRef.current;
    // A move on another document must not wait behind this one's timer.
    if (pending && pending.petriNetId !== petriNetId) flush();
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    pendingRef.current = {
      petriNetId,
      viewport,
      timer: setTimeout(flush, saveDelayMs),
    };
  };

  // Whatever is still pending when the provider goes away is saved rather than lost.
  useEffect(() => flush);

  return (
    <CanvasViewportContext
      value={{
        savedViewport: petriNetId
          ? (canvasViewports[petriNetId] ?? null)
          : null,
        rememberViewport,
      }}
    >
      {children}
    </CanvasViewportContext>
  );
};
