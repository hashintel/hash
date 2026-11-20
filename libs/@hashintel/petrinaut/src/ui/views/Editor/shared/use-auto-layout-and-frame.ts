import { usePetrinautCommands } from "../../../../react";
import { useCanvasRegistration } from "../../../plugins/plugin-editor";

export const autoLayoutShortcut = "mod+shift+l";

/** Lays the net out, then frames it once the canvas has drawn the new positions. */
export const useAutoLayoutAndFrame = () => {
  const { applyAutoLayout } = usePetrinautCommands();
  const { frameSceneAfterRender } = useCanvasRegistration();

  return async () => {
    await applyAutoLayout();
    await frameSceneAfterRender();
  };
};
