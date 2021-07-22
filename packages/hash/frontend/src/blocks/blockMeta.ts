import { createContext, useContext } from "react";
import { BlockMeta } from "./page/tsUtils";

export const BlockMetaContext = createContext<Map<string, BlockMeta>>(new Map);

export const useBlockMeta = () => useContext(BlockMetaContext);
