import { BlockVariant } from "blockprotocol";
import { useMemo } from "react";

import { UserBlock } from "../../userBlocks";
import { fuzzySearchBy } from "./fuzzySearchBy";

export const useFilteredBlocks = (
  searchText: string,
  userBlocks: UserBlock[],
) => {
  return useMemo(() => {
    const allOptions: {
      variant: BlockVariant;
      meta: UserBlock;
    }[] = Object.values(userBlocks).flatMap((blockMeta) =>
      blockMeta.variants
        ? blockMeta.variants.map((variant) => ({
            variant: {
              ...variant,
              name: variant.name ?? variant.displayName,
            },
            meta: blockMeta,
          }))
        : {
            variant: {
              description: blockMeta.description,
              name: blockMeta.displayName,
              icon: blockMeta.icon,
              properties: {},
            } as BlockVariant,
            meta: blockMeta,
          },
    );

    return fuzzySearchBy(allOptions, searchText, (option) =>
      [option.variant.name, option.variant.description, option.meta.author]
        .map((str) => str ?? "")
        .join(" "),
    );
  }, [searchText, userBlocks]);
};
