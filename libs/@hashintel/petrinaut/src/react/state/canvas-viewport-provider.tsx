import { use, type FC, type PropsWithChildren } from "react";

import { SDCPNContext } from "../document/sdcpn-context";
import {
  CanvasViewportContext,
  type CanvasViewport,
} from "./canvas-viewport-context";
import { useUserSettingsFields } from "./user-settings-context";

/**
 * Keeps the canvas viewport per document in the user settings, so a net
 * reopens where it was left, whether after switching documents or reloading.
 *
 * Every report is written as it arrives. Renderers report a settled viewport
 * rather than each frame of a gesture, so there is nothing to coalesce here,
 * and nothing left pending to lose when the page goes away.
 */
export const CanvasViewportProvider: FC<PropsWithChildren> = ({ children }) => {
  const { petriNetId } = use(SDCPNContext);
  const { canvasViewports, setCanvasViewport } = useUserSettingsFields(
    "canvasViewports",
    "setCanvasViewport",
  );

  const rememberViewport = (viewport: CanvasViewport) => {
    if (!petriNetId) {
      return;
    }
    setCanvasViewport(petriNetId, viewport);
  };

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
