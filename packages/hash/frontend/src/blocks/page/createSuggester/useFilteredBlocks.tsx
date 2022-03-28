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
      (blockMeta) => {
        if (blockMeta.variants) {
          return blockMeta.variants.map((variant) => ({
            variant: {
              ...variant,
              name: variant.name ?? variant.displayName,
            },
            meta: blockMeta,
          }));
        }

        const option: Option = {
          variant: {
            description: blockMeta.description ?? "",
            name: blockMeta.displayName ?? "",
            icon: blockMeta.icon ?? "",
            properties: {},
          },
          meta: blockMeta,
        };

        return option;
      },
    );

    return fuzzySearchBy(allOptions, searchText, (option) =>
      [option.variant.name, option.variant.description, option.meta.author]
        .map((str) => str ?? "")
        .join(" "),
    );
  }, [searchText, userBlocks]);
};
