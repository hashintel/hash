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

export const ImageWithCaption: VFC<ImageWithCaptionProps> = ({
  caption,
  image,
  onCaptionChange,
  onCaptionConfirm,
  onReset,
  onWidthChange,
  width,
}) => (
  <div className={tw`flex justify-center text-center w-full`}>
    <div className={tw`flex flex-col`}>
      <ResizeImageBlock
        imageSrc={image}
        width={width}
        updateWidth={onWidthChange}
      />
      <input
        placeholder="Add a caption"
        className={tw`focus:outline-none text-center mt-3`}
        type="text"
        value={caption}
        onChange={(event) => onCaptionChange(event.target.value)}
        onBlur={onCaptionConfirm}
      />
    </div>
    <button
      type="button"
      onClick={onReset}
      className={tw`ml-2 bg-gray-100 p-1.5 border-1 border-gray-300 rounded-sm self-start`}
    >
      <Pencil />
    </button>
  </div>
);
