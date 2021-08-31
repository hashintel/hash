import { createContext, useContext } from "react";
import { BlockMeta } from "@hashintel/hash-shared/sharedWithBackend";

export const BlockMetaContext = createContext<Map<string, BlockMeta>>(
  new Map()
);

export const useBlockMeta = () => useContext(BlockMetaContext);
