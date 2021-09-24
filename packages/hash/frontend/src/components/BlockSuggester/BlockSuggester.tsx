import { BlockVariant } from "@hashintel/block-protocol";
import React, { useContext, VoidFunctionComponent } from "react";
import { tw } from "twind";
import { BlockMetaContext } from "../../blocks/blockMeta";

/**
 * used to present list of blocks to choose from to the user
 */
export const BlockSuggester: VoidFunctionComponent = () => {
  const blocksMeta = useContext(BlockMetaContext);

  // flatMap blocks' variants
  const options = Array.from(blocksMeta.values()).flatMap(
    (blockMeta) => blockMeta.componentMetadata.variants
  );

  // @todo implement interactivity for selection
  const selectedIndex = 0;
  const onChange = (_option: BlockVariant, _index: number) => { };

  return (
    <ul
      className={tw`absolute z-10 w-96 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`}
    >
      {options.map(({ name, icon, description }, index) => (
        <li
          key={index}
          className={tw`flex border border-gray-100 ${index !== selectedIndex ? "bg-gray-50" : "bg-gray-100"} hover:bg-gray-100`}
          onClick={() => index !== selectedIndex && onChange(options[index], index)}
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
