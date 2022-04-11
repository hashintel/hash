import { BlockVariant } from "blockprotocol";
import { useMemo } from "react";

import { RemoteBlockMetadata } from "../../userBlocks";
import { fuzzySearchBy } from "./fuzzySearchBy";

type Option = {
  variant: BlockVariant;
  meta: RemoteBlockMetadata;
};

export const useFilteredBlocks = (
  searchText: string,
  userBlocks: RemoteBlockMetadata[],
) => {
  return useMemo(() => {
    const allOptions: Option[] = Object.values(userBlocks).flatMap(
      (blockMeta) =>
        // Assumes that variants have been built for all blocks in toBlockConfig
        // any required changes to block metadata should happen there
        (blockMeta.variants ?? []).map((variant) => ({
          variant,
          meta: blockMeta,
        })),
    );

    return fuzzySearchBy(allOptions, searchText, (option) =>
      [
        option.variant.name ?? option.variant.displayName,
        option.variant.description,
      ]
        .map((str) => str ?? "")
        .join(" "),
    );
  }, [searchText, userBlocks]);
};
