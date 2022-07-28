import { BlockVariant } from "@blockprotocol/core";
import { HashBlockMeta, isTextBlock } from "@hashintel/hash-shared/blocks";
import { useMemo } from "react";
import { BlocksMap } from "../createEditorView";

import { fuzzySearchBy } from "./fuzzySearchBy";

type Option = {
  variant: BlockVariant;
  meta: HashBlockMeta;
};

export const useFilteredBlocks = (
  searchText: string,
  blocksMap: BlocksMap,
  textBlocksOnly = false,
) => {
  return useMemo(() => {
    const allOptions: Option[] = Object.values(blocksMap)
      .filter((block) => !textBlocksOnly || isTextBlock(block.meta.componentId))
      .flatMap(({ meta }) =>
        // Assumes that variants have been built for all blocks in toBlockConfig
        // any required changes to block metadata should happen there
        (meta.variants ?? []).map((variant) => ({
          variant,
          meta,
        })),
      );

    return fuzzySearchBy(
      allOptions,
      searchText,
      (option) => option.variant.name ?? "",
    );
  }, [blocksMap, textBlocksOnly, searchText]);
};
