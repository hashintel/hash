import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { BlockVariant } from "@blockprotocol/core";
import { useMemo } from "react";

import { fuzzySearchBy } from "./fuzzySearchBy";
import { BlocksMetaMap } from "../createEditorView";

type Option = {
  variant: BlockVariant;
  meta: BlockMeta["componentMetadata"];
};

const SWAPPABLE_BLOCKS = [
  "https://blockprotocol.org/blocks/@hash/paragraph",
  "https://blockprotocol.org/blocks/@hash/header",
  "https://blockprotocol.org/blocks/@hash/callout",
];

export const isBlockSwappable = (blockId: string = "") =>
  SWAPPABLE_BLOCKS.includes(blockId);

export const useFilteredBlocks = (
  searchText: string,
  blocksMetaMap: BlocksMetaMap,
  textBlocksOnly = false,
) => {
  return useMemo(() => {
    const allOptions: Option[] = Object.values(blocksMetaMap)
      .filter(
        (block) =>
          !textBlocksOnly ||
          isBlockSwappable(block.componentMetadata.componentId),
      )
      .flatMap(({ componentMetadata: blockMeta }) =>
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
      (option) => option.variant.name ?? "",
    );
  }, [blocksMetaMap, textBlocksOnly, searchText]);
};
