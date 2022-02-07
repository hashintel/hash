import { BlockVariant } from "blockprotocol";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { useMemo, VFC } from "react";
import { tw } from "twind";

import { useBlocksMeta } from "../../blocksMeta";
import { fuzzySearchBy } from "./fuzzySearchBy";
import { Suggester } from "./Suggester";

export interface BlockSuggesterProps {
  search?: string;
  onChange(variant: BlockVariant, block: BlockMeta): void;
  className?: string;
}

/**
 * used to present list of blocks to choose from to the user
 *
 * @todo highlight variant of the prosemirror-node this suggester is attached to.
 */
export const BlockSuggester: VFC<BlockSuggesterProps> = ({
  search = "",
  onChange,
  className,
}) => {
  const { value: blocksMeta } = useBlocksMeta();

  const options = useMemo(() => {
    const allOptions = Object.values(blocksMeta).flatMap((blockMeta) =>
      blockMeta.componentMetadata.variants.map((variant) => ({
        variant,
        meta: blockMeta,
      })),
    );

    return fuzzySearchBy(allOptions, search, (option) =>
      [option.variant.displayName, option.variant.description]
        .map((str) => str ?? "")
        .join(" "),
    );
  }, [search, blocksMeta]);

  return (
    <Suggester
      options={options}
      renderItem={(option) => (
        <>
          <div className={tw`flex w-16 items-center justify-center`}>
            <img
              className={tw`w-6 h-6`}
              alt={option.variant.displayName}
              src={option.variant.icon}
            />
          </div>
          <div className={tw`py-3 flex-1 pr-2`}>
            <p className={tw`text-sm font-bold`}>
              {option.variant.displayName}
            </p>
            <p className={tw`text-xs text-opacity-60 text-black`}>
              {option.variant.description}
            </p>
          </div>
        </>
      )}
      itemKey={({ meta, variant }) =>
        `${meta.componentMetadata.name}/${variant.displayName}`
      }
      onChange={(option) => onChange(option.variant, option.meta)}
      className={className}
    />
  );
};
