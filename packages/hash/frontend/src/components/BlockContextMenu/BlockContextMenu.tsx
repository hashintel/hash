import React, { forwardRef } from "react";
import { tw } from "twind";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import CopyIcon from "@material-ui/icons/FileCopy";
import {
  BlockSuggester,
  BlockSuggesterProps,
} from "../BlockSuggester/BlockSuggester";

type BlockContextMenuProps = {
  onChange: any;
};

export const BlockContextMenu = forwardRef<
  HTMLDivElement,
  BlockContextMenuProps
>(({ onChange }, ref) => {
  return (
    <div
      className={tw`absolute z-10 w-60 bg-white border-gray-200 border-1 shadow-xl rounded`}
      ref={ref}
    >
      <div className={tw`px-4 pt-3 mb-2 `}>
        <input
          className={tw`block w-full px-2 py-1 bg-gray-50 border-1 text-sm rounded-sm `}
          placeholder="Filter actions..."
        />
      </div>
      <ul className={tw`text-sm mb-4`}>
        <li className={tw`hover:bg-gray-100 flex items-center py-1 px-4`}>
          <DeleteOutlineIcon className={tw`!text-inherit mr-1`} />
          <span>Delete</span>
        </li>
        <li className={tw`hover:bg-gray-100 flex items-center py-1  px-4`}>
          <CopyIcon className={tw`!text-inherit mr-1`} />
          <span>Duplicate</span>
        </li>
        <li
          className={tw`hover:bg-gray-100 flex items-center py-1 px-4 relative group`}
        >
          <DeleteOutlineIcon className={tw`!text-inherit mr-1`} />
          <span>Turn into</span>
          <span className={tw`ml-auto`}>&rarr;</span>
          <BlockSuggester
            className={"left-full ml-0.5 mt-2 hidden hover:block group-hover:block shadow-xl"}
            onChange={onChange}
          />
        </li>
      </ul>
      <div
        className={tw`border-t-1 border-gray-200 px-4 py-2 text-xs text-gray-400`}
      >
        <p>Last edited by Valentino Ugbala</p>
        <p>11/03/2021</p>
      </div>
    </div>
  );
});
