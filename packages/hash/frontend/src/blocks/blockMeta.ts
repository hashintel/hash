import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { createContext, useContext } from "react";

export const BlockMetaContext = createContext<Map<string, BlockMeta>>(
  new Map()
);

export const useBlockMeta = () => useContext(BlockMetaContext);
