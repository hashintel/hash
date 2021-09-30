/**
 * This file was written during sandbox prototyping. It will be slowly removed
 * & replaced with typescript integrate with our system
 *
 * @todo remove this file
 */

import "prosemirror-view/style/prosemirror.css";
import React, { forwardRef, useEffect, useState } from "react";
import { tw } from "twind";
import { BlockSuggester } from "../../components/BlockSuggester/BlockSuggester";
import DragVertical from "../../components/Icons/DragVertical";

/**
 * specialized block-type/-variant select field
 */
export const BlockHandle = forwardRef((_props, ref) => {
  const [isPopoverVisible, setPopoverVisible] = useState(false);

  useEffect(() => {
    const closePopover = () => setPopoverVisible(false);
    document.addEventListener("click", closePopover);
    return () => document.removeEventListener("click", closePopover);
  }, []);

  return (
    <div ref={ref} className={tw`relative cursor-pointer`}>
      <DragVertical
        onClick={(evt) => {
          evt.stopPropagation(); // skips closing handler
          setPopoverVisible(true);
        }}
      />
      {isPopoverVisible && (
        <BlockSuggester
          onChange={() => {
            throw new Error("not yet implemented");
          }}
        />
      )}
    </div>
  );
});
