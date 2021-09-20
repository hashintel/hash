import React, { useLayoutEffect, useRef, useState } from "react";
import { tw } from "twind";

type ResizeBlockProps = {
  imageSrc: string;
  width: number | undefined;
  setWidth: (width: string | number) => void;
};

const BLOCK_RESIZER_POSITIONS = ["left", "right"] as const;

export const ResizeImageBlock: React.VFC<ResizeBlockProps> = ({
  imageSrc,
  width,
  setWidth,
}) => {
  const imageRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    if (!imageRef.current) return;
    if (!width) {
      setWidth(imageRef.current.getBoundingClientRect().width);
    }
  }, []);

  const handleResize = (evt: React.MouseEvent, direction: "left" | "right") => {
    function onMouseMove(mouseMoveEvt: MouseEvent) {
      if (!imageRef.current) return;

      const { left, right } = imageRef.current.getBoundingClientRect();
      let newWidth;

      if (direction == "right") {
        newWidth = mouseMoveEvt.pageX - left;
      }

      if (direction == "left") {
        newWidth = right - mouseMoveEvt.pageX;
      }

      if (!newWidth || newWidth < 96) {
        return;
      }

      setWidth(newWidth);
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className={tw`relative flex group`}>
      <img
        className={tw`mx-auto`}
        ref={imageRef}
        style={{
          // maxWidth: "100%",
          width: width || "100%",
        }}
        src={imageSrc}
        alt="Image block"
      />
      {BLOCK_RESIZER_POSITIONS.map((position) => (
        <div
          style={{ maxHeight: "50%" }}
          className={tw`transition-all absolute ${
            position == "left" ? "left-1" : "right-1"
          } top-1/2 -translate-y-1/2 h-12 w-1.5 rounded-full bg-black bg-opacity-70 cursor-col-resize opacity-0 group-hover:opacity-100`}
          onMouseDown={(e) => handleResize(e, position)}
        ></div>
      ))}
    </div>
  );
};
