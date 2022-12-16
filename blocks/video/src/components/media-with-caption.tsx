import { FunctionComponent } from "react";
import Pencil from "../svgs/pencil";
import { ResizeImageBlock } from "./resize-image-block";

type MediaWithCaptionProps = {
  src: string;
  caption: string;
  onCaptionChange: (caption: string) => void;
  onCaptionConfirm: () => void;
  onReset: () => void;
  readonly?: boolean;
  type: "image" | "video";
} & (
  | {
      type: "image";
      width: number | undefined;
      onWidthChange: (width: number) => void;
    }
  | {
      type: "video";
    }
);

export const MediaWithCaption: FunctionComponent<MediaWithCaptionProps> = ({
  caption,
  src,
  onCaptionChange,
  onCaptionConfirm,
  onReset,
  readonly,
  ...props
}) => {
  const captionNode = (
    <input
      placeholder="Add a caption"
      className={tw`border-none bg-transparent focus:outline-none text-center mt-3`}
      type="text"
      value={caption}
      disabled={readonly}
      onChange={(event) => onCaptionChange(event.target.value)}
      onBlur={onCaptionConfirm}
    />
  );
  return (
    <div
      style={{
        display: "flex",
        textAlign: "center",
        justifyContent: "center",
        width: "100%",
      }}
    >
      {props.type === "image" ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <ResizeImageBlock
            imageSrc={src}
            width={props.width}
            updateWidth={props.onWidthChange}
          />

          {captionNode}
        </div>
      ) : (
        <div style={{ maxWidth: "100%" }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            controls
            style={{
              maxWidth: "100%",
            }}
            src={src ?? ""}
          />
          {captionNode}
        </div>
      )}
      {!readonly && (
        <button
          type="button"
          onClick={onReset}
          style={{
            padding: "0.375rem",
            marginLeft: "0.5rem",
            backgroundColor: "#F3F4F6",
            alignSelf: "flex-start",
            borderRadius: "0.125rem",
            borderColor: "#D1D5DB",
            borderStyle: "solid",
          }}
        >
          <Pencil />
        </button>
      )}
    </div>
  );
};
