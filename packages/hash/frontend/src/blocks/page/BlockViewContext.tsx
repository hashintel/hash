import React, { useContext } from "react";
import type { BlockView } from "./BlockView";

/** used to detect whether or not a context value was provided */
const nullBlockView = {};

/** used to hold the blockView instance */
export const BlockViewContext = React.createContext<BlockView>(
  nullBlockView as BlockView,
);

/** used to access the blockView instance and ensure one has been provided */
export const useBlockView = () => {
  const blockView = useContext(BlockViewContext);

  if (blockView === nullBlockView) {
    throw new Error("no BlockViewContext value has been provided");
  }

  return blockView;
};
