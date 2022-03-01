import React, { VFC } from "react";
import { tw } from "twind";
import Pencil from "../svgs/Pencil";

type VideoWithCaptionProps = {
  src: string | undefined;
  caption: string;
  onCaptionConfirm: () => void;
  onReset: () => void;
  onCaptionChange: (value: string) => void;
};

export const VideoWithCaption: VFC<VideoWithCaptionProps> = ({
  caption,
  onCaptionChange,
  onCaptionConfirm,
  onReset,
  src,
}) => {
  return (
    <div className={tw`flex justify-center text-center w-full`}>
      <div className={tw`max-w-full`}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          controls
          style={{
            maxWidth: "100%",
          }}
          src={src ?? ""}
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
};
