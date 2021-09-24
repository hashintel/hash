import React, { useLayoutEffect, useRef } from "react";
import { tw } from "twind";

type ResizeBlockProps = {
  width: number | undefined;
  updateWidth: (width: number) => void;
};

const BLOCK_RESIZER_POSITIONS = ["left", "right"] as const;

const MIN_WIDTH = 96;

// @todo set a max-width

// @todo make a reusable component, since this is used by image block

export const ResizeBlock: React.FC<ResizeBlockProps> = ({
  children,
  width,
  updateWidth,
}) => {
  const divRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    if (!divRef.current) return;

    const divWidth = divRef.current.getBoundingClientRect().width;

    if (!width) {
      updateWidth(divWidth);
      return;
    }

    if (width && divWidth !== width) {
      divRef.current.style.width = `${width}px`;
    }
  }, [width, updateWidth]);

  const handleResize = (evt: React.MouseEvent, direction: "left" | "right") => {
    function onMouseMove(mouseMoveEvt: MouseEvent) {
      if (!divRef.current) return;
      let newWidth;
      const { left, right } = divRef.current.getBoundingClientRect();

      if (direction === "right") {
        newWidth = mouseMoveEvt.pageX - left;
      }

      if (direction === "left") {
        newWidth = right - mouseMoveEvt.pageX;
      }

      if (newWidth && newWidth > MIN_WIDTH) {
        divRef.current.style.width = `${newWidth}px`;
      }
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      setTimeout(() => {
        if (!divRef.current) return;
        const { width: newWidth } = divRef.current.getBoundingClientRect();
        updateWidth(newWidth);
      }, 1000);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div ref={divRef} className={tw`relative flex group max-w-full`} style={{ minHeight: 340 }}>
      {children}
      {BLOCK_RESIZER_POSITIONS.map((position) => (
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
