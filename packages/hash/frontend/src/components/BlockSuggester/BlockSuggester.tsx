import { BlockVariant } from "@hashintel/block-protocol";
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useKey } from "rooks";
import { tw } from "twind";
import LinkIcon from '@mui/icons-material/Link';

import { BlockMetaContext } from "../../blocks/blockMeta";
import { fuzzySearchBy } from "./fuzzySearchBy";

interface BlockSuggesterProps {
  search?: string;
  onChange(variant: BlockVariant): void;
  entityId: string;
}

/**
 * used to present list of blocks to choose from to the user
 *
 * @todo highlight variant of the prosemirror-node this suggester is attached to.
 * more context: use the entity store – this will require the entity store stays
 * up to date with cached properties and perhaps we need two versions of the
 * entity store, one representing the current, yet to be saved doc and one
 * representing the saved doc – we will also be using the variant name for
 * comparison instead of property values.
 */
export const BlockSuggester: React.VFC<BlockSuggesterProps> = ({
  search = "",
  onChange,
  entityId
}) => {
  const blocksMeta = useContext(BlockMetaContext);

  const options = useMemo(() => {
    const variants = Array.from(blocksMeta.values()).flatMap(
      (blockMeta) => blockMeta.componentMetadata.variants
    );

    return fuzzySearchBy(variants, search, (variant) =>
      [variant.displayName, variant.description]
        .map((str) => str || "")
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
    onChange(options[selectedIndex]);
  });

  return (
    <ul
      className={tw`absolute z-10 w-96 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`}
    >
      {options.map(({ displayName, icon, description }, index) => (
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
        <li
          ref={index === selectedIndex ? selectedRef : undefined}
          key={displayName}
          className={tw`flex border border-gray-100 ${
            index !== selectedIndex ? "bg-gray-50" : "bg-gray-100"
          } hover:bg-gray-100`}
          onClick={() => onChange(options[index])}
        >
          <div className={tw`flex w-16 items-center justify-center`}>
            <img className={tw`w-6 h-6`} alt={displayName} src={icon} />
          </div>
          <div className={tw`py-3`}>
            <p className={tw`text-sm font-bold`}>{displayName}</p>
            <p className={tw`text-xs text-opacity-60 text-black`}>
              {description}
            </p>
          </div>
        </li>
      ))}
      <li
        className={tw`flex border border-gray-100 bg-gray-50 hover:bg-gray-100`}
        onClick={() => {
          const url = new URL(location.href);
          url.hash = entityId;
          navigator.clipboard.writeText(url.toString());
        }}
      >
        <div className={tw`flex w-16 items-center justify-center`}>
          <LinkIcon className={tw`w-6 h-6`} />
        </div>
        <div className={tw`py-3`}>
          <p className={tw`text-sm font-bold`}>Copy link</p>
          <p className={tw`text-xs text-opacity-60 text-black`}>
            Copy link to current block
          </p>
        </div>
      </li>
    </ul>
  );
};
