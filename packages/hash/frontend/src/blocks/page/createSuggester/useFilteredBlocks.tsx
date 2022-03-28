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
        if (blockMeta.variants && blockMeta.variants.length > 0) {
          return blockMeta.variants.map((variant) => ({
            variant: {
              ...variant,
              name: variant.name ?? variant.displayName,
            },
            meta: blockMeta,
          }));
        }

        return {
          variant: {
            description:
              blockMeta.description ?? blockMeta.displayName ?? blockMeta.name,
            displayName: blockMeta.displayName ?? blockMeta.name,
            // @todo add a fallback icon
            icon: blockMeta.icon ?? "",
            name: blockMeta.displayName ?? blockMeta.name,
            properties: blockMeta.default ?? {},
          },
          meta: blockMeta,
        };
      },
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
