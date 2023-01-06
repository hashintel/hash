import { BlockVariant } from "@blockprotocol/core";
import { HashBlock, HashBlockMeta } from "@hashintel/hash-shared/blocks";
import { useMemo } from "react";

import { fuzzySearchBy } from "./fuzzy-search-by";

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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
      (meta.variants ?? []).map((variant) => ({
        variant,
        meta,
      })),
    );

    return fuzzySearchBy(
      allOptions,
      searchText,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
      (option) => option.variant.name ?? "",
    );
  }, [compatibleBlocks, searchText]);
};
