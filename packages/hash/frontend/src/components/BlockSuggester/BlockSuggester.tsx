import { BlockVariant } from "@hashintel/block-protocol";
import React, { useContext } from "react";
import { tw } from "twind";
import { BlockMetaContext } from "../../blocks/blockMeta";

interface BlockSuggesterProps {
  selectedIndex: number;
}

/**
 * used to present list of blocks to choose from to the user
 */
export const BlockSuggester: React.VFC<BlockSuggesterProps> = ({
  selectedIndex,
}) => {
  const blocksMeta = useContext(BlockMetaContext);

  // flatMap blocks' variants
  const options = Array.from(blocksMeta.values()).flatMap(
    (blockMeta) => blockMeta.componentMetadata.variants
  );
  
  // rotate the index through the available options
  selectedIndex += options.length;
  selectedIndex %= options.length;

  /**
   * @todo use the entity store – this will
   * require the entity store stays up
   * to date with cached properties and
   * perhaps we need two versions of the
   * entity store, one representing the
   * current, yet to be saved doc and one
   * representing the saved doc – we will
   * also be using the variant name for
   * comparison instead of property
   * values
   */
  const onChange = (_option: BlockVariant, _index: number) => {};

  return (
    <ul
      className={tw`absolute z-10 w-96 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`}
    >
      {options.map(({ name, icon, description }, index) => (
        <li
          key={index}
          className={tw`flex border border-gray-100 ${
            index !== selectedIndex ? "bg-gray-50" : "bg-gray-100"
          } hover:bg-gray-100`}
          onClick={() =>
            index !== selectedIndex && onChange(options[index], index)
          }
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
