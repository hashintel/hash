import type { FunctionComponent, MouseEvent } from "react";
import { useLayoutEffect, useRef } from "react";
import { tw } from "twind";

type ResizeBlockProps = {
  imageSrc: string;
  width: number | undefined;
  updateWidth: (width: number) => void;
  readonly?: boolean;
};

const BLOCK_RESIZER_POSITIONS = ["left", "right"] as const;

const MIN_WIDTH = 96;

// @todo set a max-width

export const ResizeImageBlock: FunctionComponent<ResizeBlockProps> = ({
  imageSrc,
  width,
  updateWidth,
  readonly,
}) => {
  const imageRef = useRef<HTMLImageElement>(null);

  const updateWidthRef = useRef(updateWidth);

  useLayoutEffect(() => {
    updateWidthRef.current = updateWidth;
  });

  useLayoutEffect(() => {
    if (!imageRef.current) return;
    if (!imageSrc) return;

    const imageWidth = imageRef.current.getBoundingClientRect().width;

    if (!width) {
      updateWidth(imageWidth);
      return;
    }

    if (imageWidth !== width) {
      imageRef.current.style.width = `${width}px`;
    }
  }, [width, imageSrc, updateWidth]);

  const handleResize = (_evt: MouseEvent, direction: "left" | "right") => {
    function onMouseMove(mouseMoveEvt: globalThis.MouseEvent) {
      if (!imageRef.current) return;
      let newWidth;
      const { left, right } = imageRef.current.getBoundingClientRect();

      if (direction === "right") {
        newWidth = mouseMoveEvt.pageX - left;
      }

      if (direction === "left") {
        newWidth = right - mouseMoveEvt.pageX;
      }

      if (newWidth && newWidth > MIN_WIDTH) {
        imageRef.current.style.width = `${newWidth}px`;
      }
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      setTimeout(() => {
        if (!imageRef.current) return;
        const { width: newWidth } = imageRef.current.getBoundingClientRect();
        updateWidthRef.current(newWidth);
      }, 1000);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className={tw`relative flex group`}>
      {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
      <img
        className={tw`mx-auto max-w-full`}
        ref={imageRef}
        src={imageSrc}
        alt="Image block"
      />
      {readonly
        ? null
        : BLOCK_RESIZER_POSITIONS.map((position) => (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              key={position}
              style={{ maxHeight: "50%" }}
              className={tw`transition-all absolute ${
                position === "left" ? "left-1" : "right-1"
              } top-1/2 -translate-y-1/2 h-12 w-1.5 rounded-full bg-black bg-opacity-70 cursor-col-resize opacity-0 group-hover:opacity-100`}
              onMouseDown={(evt) => handleResize(evt, position)}
            />
          ))}
    </div>
  );
};
