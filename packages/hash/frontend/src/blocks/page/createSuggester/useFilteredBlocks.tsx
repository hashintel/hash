import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { BlockVariant } from "blockprotocol";
import { useMemo } from "react";

import { fuzzySearchBy } from "./fuzzySearchBy";
import { BlocksMetaMap } from "../createEditorView";

type Option = {
  variant: BlockVariant;
  meta: BlockMeta["componentMetadata"];
};

export const useFilteredBlocks = (
  searchText: string,
  blocksMetaMap: BlocksMetaMap,
) => {
  return useMemo(() => {
    const allOptions: Option[] = Object.values(blocksMetaMap).flatMap(
      ({ componentMetadata: blockMeta }) =>
        // Assumes that variants have been built for all blocks in toBlockConfig
        // any required changes to block metadata should happen there
        (blockMeta.variants ?? []).map((variant) => ({
          variant,
          meta: blockMeta,
        })),
    );

    return fuzzySearchBy(
      allOptions,
      searchText,
      (option) => option.variant.name ?? option.variant.displayName ?? "",
    );
  }, [blocksMetaMap, searchText]);
};
