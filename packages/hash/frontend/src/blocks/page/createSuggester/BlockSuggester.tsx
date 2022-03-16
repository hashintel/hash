import { BlockVariant } from "blockprotocol";
import { useMemo, VFC } from "react";
import { tw } from "twind";

import { fuzzySearchBy } from "./fuzzySearchBy";
import { Suggester } from "./Suggester";
import { UserBlock, useUserBlocks } from "../../userBlocks";
import { useFilteredBlocks } from "./useFilteredBlocks";

export interface BlockSuggesterProps {
  search?: string;
  onChange(variant: BlockVariant, block: UserBlock): void;
  className?: string;
}

// @todo remove this when API returns actual icon URL
export const getVariantIcon = (option: {
  variant: BlockVariant;
  meta: UserBlock;
}): string | undefined => {
  if (option.variant.icon?.startsWith("/")) {
    return `https://blockprotocol.org${option.variant.icon}`;
  }

  if (option.variant.icon?.startsWith("public/")) {
    return `https://blockprotocol.org${
      option.meta.icon!.split("public/")[0]
    }public/${option.variant.icon.split("public/")[1]}`;
  }

  return option.variant.icon;
};

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
  const { value: userBlocks } = useUserBlocks();

  const filteredBlocks = useFilteredBlocks(search, userBlocks);

  return (
    <Suggester
      options={filteredBlocks}
      renderItem={(option) => (
        <>
          <div className={tw`flex w-16 items-center justify-center`}>
            {option?.variant.icon && (
              <img
                className={tw`w-6 h-6`}
                alt={option.variant.name}
                src={getVariantIcon(option)}
              />
            )}
          </div>
          <div className={tw`py-3 flex-1 pr-2`}>
            <p className={tw`text-sm font-bold`}>{option?.variant.name}</p>
            <p className={tw`text-xs text-opacity-60 text-black`}>
              {option?.variant.description}
            </p>
          </div>
        </>
      )}
      itemKey={({ meta, variant }) => `${meta.name}/${variant.name}`}
      onChange={(option) => {
        onChange(option.variant, option.meta);
      }}
      className={className}
    />
  );
};
