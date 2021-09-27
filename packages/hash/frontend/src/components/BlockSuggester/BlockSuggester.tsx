import { BlockVariant } from "@hashintel/block-protocol";
import React, { useContext, useEffect, useRef, useState } from "react";
import { tw } from "twind";
import { BlockMetaContext } from "../../blocks/blockMeta";
import { useKey } from "rooks";

interface BlockSuggesterProps {
  onChange(variant: BlockVariant): void;
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
  onChange,
}) => {
  const blocksMeta = useContext(BlockMetaContext);

  // flatMap blocks' variants
  const options = Array.from(blocksMeta.values()).flatMap(
    (blockMeta) => blockMeta.componentMetadata.variants
  );

  const [selectedIndex, setSelectedIndex] = useState(0);

  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();
    let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
    // rotate the index through the available options
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
    onChange(matchedOptions[selectedIndex]);
  });

  return (
    <ul
      className={tw`absolute z-10 w-96 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`}
    >
      {options.map(({ name, icon, description }, index) => (
        <li
          ref={index === selectedIndex ? selectedRef : undefined}
          key={index}
          className={tw`flex border border-gray-100 ${
            index !== selectedIndex ? "bg-gray-50" : "bg-gray-100"
          } hover:bg-gray-100`}
          onClick={() => onChange(options[index])}
        >
          <div className={tw`flex w-16 items-center justify-center`}>
            <img className={tw`w-6 h-6`} alt={name} src={icon} />
          </div>
          <div className={tw`py-3`}>
            <p className={tw`text-sm font-bold`}>{name}</p>
            <p className={tw`text-xs text-opacity-60 text-black`}>
              {description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};
