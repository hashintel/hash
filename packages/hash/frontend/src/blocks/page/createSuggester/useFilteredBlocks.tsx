import { BlockVariant } from "@blockprotocol/core";
import { HashBlock, HashBlockMeta } from "@hashintel/hash-shared/blocks";
import { useMemo } from "react";

import { fuzzySearchBy } from "./fuzzySearchBy";

type Option = {
  variant: BlockVariant;
  meta: HashBlockMeta;
};

export const useFilteredBlocks = (
  searchText: string,
  compatibleBlocks: HashBlock[],
) => {
  return useMemo(() => {
    const allOptions: Option[] = compatibleBlocks.flatMap(({ meta }) =>
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
  }, [compatibleBlocks, searchText]);
};
