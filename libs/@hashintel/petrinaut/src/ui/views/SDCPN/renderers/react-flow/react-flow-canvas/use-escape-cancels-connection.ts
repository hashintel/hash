import { useStoreApi } from "@xyflow/react";
import { useEffect } from "react";

/**
 * Escape abandons the arc being drawn, whether it is dragged or was started
 * by clicking or pressing its handle. Must run inside the React Flow
 * provider.
 */
export const useEscapeCancelsConnection = () => {
  const flowStore = useStoreApi();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { connection, connectionClickStartHandle, cancelConnection } =
        flowStore.getState();
      if (
        event.key !== "Escape" ||
        (!connection.inProgress && !connectionClickStartHandle)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cancelConnection();
      flowStore.setState({ connectionClickStartHandle: null });
    };

    // Capture phase, so the canvas's other Escape handling never sees it.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [flowStore]);
};
