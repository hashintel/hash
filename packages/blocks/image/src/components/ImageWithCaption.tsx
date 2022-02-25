import React, { VFC } from "react";
import { tw } from "twind";
import Pencil from "../svgs/Pencil";
import { ResizeImageBlock } from "./ResizeImageBlock";

type ImageWithCaptionProps = {
  image: string;
  width: number | undefined;
  onWidthChange: (width: number) => void;
  caption: string;
  onCaptionChange: (caption: string) => void;
  onCaptionConfirm: () => void;
  onReset: () => void;
};

export const ImageWithCaption: VFC<ImageWithCaptionProps> = (props) => (
  <div className={tw`flex justify-center text-center w-full`}>
    <div className={tw`flex flex-col`}>
      <ResizeImageBlock
        imageSrc={props.image}
        width={props.width}
        updateWidth={props.onWidthChange}
      />
      <input
        placeholder="Add a caption"
        className={tw`focus:outline-none text-center mt-3`}
        type="text"
        value={props.caption}
        onChange={(event) => props.onCaptionChange(event.target.value)}
        onBlur={props.onCaptionConfirm}
      />
    </div>
    <button
      type="button"
      onClick={props.onReset}
      className={tw`ml-2 bg-gray-100 p-1.5 border-1 border-gray-300 rounded-sm self-start`}
    >
      <Pencil />
    </button>
  </div>
);
