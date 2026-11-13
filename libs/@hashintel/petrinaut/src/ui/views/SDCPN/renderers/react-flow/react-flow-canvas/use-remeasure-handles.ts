import { useUpdateNodeInternals } from "@xyflow/react";
import { useEffect, useRef } from "react";

/**
 * Has React Flow measure a node's handles again, which it otherwise does
 * only when the node resizes: once whenever `layoutKey` changes, and once
 * per frame in which the returned callback is called, for handles that slide
 * to their place.
 */
export const useRemeasureHandles = (
  nodeId: string,
  layoutKey: string,
): (() => void) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const pendingFrame = useRef<number | null>(null);

  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [updateNodeInternals, nodeId, layoutKey]);

  useEffect(
    () => () => {
      if (pendingFrame.current !== null) {
        cancelAnimationFrame(pendingFrame.current);
      }
    },
    [],
  );

  return () => {
    // Every handle that finishes sliding reports it: one measurement serves
    // them all.
    if (pendingFrame.current !== null) {
      return;
    }
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      updateNodeInternals(nodeId);
    });
  };
};
