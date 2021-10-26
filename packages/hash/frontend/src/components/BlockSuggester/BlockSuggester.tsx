import { BlockVariant } from "@hashintel/block-protocol";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useKey } from "rooks";
import { tw } from "twind";
import { BlockMetaContext } from "../../blocks/blockMeta";
import { fuzzySearchBy } from "./fuzzySearchBy";

export interface BlockSuggesterProps {
  search?: string;
  onChange(variant: BlockVariant, block: BlockMeta): void;
}

/**
 * used to present list of blocks to choose from to the user
 *
 * @todo highlight variant of the prosemirror-node this suggester is attached to.
 */
export const BlockSuggester: React.VFC<BlockSuggesterProps> = ({
  search = "",
  onChange,
}) => {
  const blocksMeta = useContext(BlockMetaContext);

  const options = useMemo(() => {
    const allOptions = Array.from(blocksMeta.values()).flatMap((blockMeta) =>
      blockMeta.componentMetadata.variants.map((variant) => ({
        variant,
        meta: blockMeta,
      }))
    );

    return fuzzySearchBy(allOptions, search, (option) =>
      [option.variant.displayName, option.variant.description]
        .map((str) => str ?? "")
        .join(" ")
    );
  }, [search, blocksMeta]);

  const [selectedIndex, setSelectedIndex] = useState(0);

  // reset selected index if it exceeds the options available
  if (selectedIndex >= options.length) {
    setSelectedIndex(options.length - 1);
  }

  // enable cyclic arrow-key navigation
  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();
    let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
    index += options.length;
    index %= options.length;
    setSelectedIndex(index);
  });

  // scroll the selected option into view
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(
    () => selectedRef.current?.scrollIntoView({ block: "nearest" }),
    [selectedIndex]
  );

  useKey(["Enter"], (event) => {
    event.preventDefault();
    onChange(options[selectedIndex].variant, options[selectedIndex].meta);
  });

  return (
    <ul
      className={tw`absolute z-10 w-96 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`}
    >
      {options.map((option, index) => (
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
        <li
          ref={index === selectedIndex ? selectedRef : undefined}
          key={`${option.meta.componentMetadata.name}/${option.variant.displayName}`}
          className={tw`flex border border-gray-100 ${
            index !== selectedIndex ? "bg-gray-50" : "bg-gray-100"
          } hover:bg-gray-100`}
          onClick={() => onChange(option.variant, option.meta)}
        >
          <div className={tw`flex w-16 items-center justify-center`}>
            <img
              className={tw`w-6 h-6`}
              alt={option.variant.displayName}
              src={option.variant.icon}
            />
          </div>
          <div className={tw`py-3`}>
            <p className={tw`text-sm font-bold`}>
              {option.variant.displayName}
            </p>
            <p className={tw`text-xs text-opacity-60 text-black`}>
              {option.variant.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};
