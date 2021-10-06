import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { tw } from "twind";
import { MIN_WIDTH, MIN_HEIGHT } from "../constants";
import { CornerResize } from "../svgs/CornerResize";

type ResizeBlockProps = {
  width: number | undefined;
  height: number | undefined;
  maxWidth: number;
  updateDimensions: (width: number, height: number) => void;
  shouldRespectAspectRatio: boolean;
};

/**
 * @todo distinguish between embeds that need
 * - all resizer blocks (horizontal && vertical)
 * - horizontal resizer blocks
 */
const BLOCK_RESIZER_POSITIONS = [
  {
    position: "left",
    className: "left-1 top-1/2 -translate-y-1/2 h-12 w-1.5 cursor-col-resize",
  },
  {
    position: "right",
    className: "right-1 top-1/2 -translate-y-1/2 h-12 w-1.5 cursor-col-resize",
  },
  {
    position: "bottom",
    className:
      "bottom-1 left-1/2 -translate-x-1/2 w-12 h-1.5 cursor-row-resize",
  },
  {
    position: "bottom-right",
    className: "bottom-1 right-1 cursor-nwse-resize",
  },
  {
    position: "bottom-left",
    className: "bottom-1 left-1 cursor-nesw-resize",
  },
] as const;

/**
 * @todo this component is a candidate for the hash-ui package
 *  and should be imported from there
 */

export const ResizeBlock: React.FC<ResizeBlockProps> = ({
  children,
  width,
  height,
  maxWidth,
  shouldRespectAspectRatio,
  updateDimensions,
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const childrenWrapperRef = useRef<HTMLDivElement>(null);

  const aspectRatio = useMemo(() => {
    if (width && height && shouldRespectAspectRatio) {
      return Math.round((width / height) * 100) / 100;
    }
  }, [height, width, shouldRespectAspectRatio]);

  const maxHeight = useMemo(
    () => (aspectRatio ? Math.ceil(maxWidth / aspectRatio) : undefined),
    [aspectRatio, maxWidth]
  );

  const updateLocalDimensions = useCallback(
    (dimensions: { width?: number; height?: number; aspectRatio?: number }) => {
      if (!divRef.current) return;

      if (dimensions.width) {
        /**
         * ensure width is within boundary
         */
        if (
          (maxWidth && dimensions.width > maxWidth) ||
          dimensions.width < MIN_WIDTH
        ) {
          return;
        }
        divRef.current.style.width = `${dimensions.width}px`;

        /**
         * update height if there's an aspect ratio
         */
        if (dimensions.aspectRatio) {
          divRef.current.style.height = `${Math.ceil(
            dimensions.width / dimensions.aspectRatio
          )}px`;
          return;
        }
      }

      if (dimensions.height) {
        if (
          (maxHeight && dimensions.height > maxHeight) ||
          dimensions.height < MIN_HEIGHT
        ) {
          return;
        }

        /**
         * update width if there's an aspect ratio and the derived
         * width is within boundary
         */
        if (dimensions.aspectRatio) {
          const derivedWidth = Math.ceil(
            dimensions.height * dimensions.aspectRatio
          );

          if (
            (maxWidth && derivedWidth > maxWidth) ||
            derivedWidth < MIN_WIDTH
          ) {
            return;
          }

          divRef.current.style.width = `${derivedWidth}px`;
        }

        divRef.current.style.height = `${dimensions.height}px`;
      }
    },
    [maxHeight, maxWidth]
  );

  useLayoutEffect(() => {
    if (!divRef.current) return;
    const { width: localWidth, height: localHeight } =
      divRef.current.getBoundingClientRect();

    if (localWidth !== width || localHeight !== height) {
      updateLocalDimensions({ width, height, aspectRatio });
    }
  }, [width, height, aspectRatio, updateLocalDimensions]);

  const handleResize = (
    evt: React.MouseEvent,
    direction: typeof BLOCK_RESIZER_POSITIONS[number]["position"]
  ) => {
    if (!childrenWrapperRef.current) return;

    function onMouseMove(mouseMoveEvt: MouseEvent) {
      if (!divRef.current) return;
      if (!childrenWrapperRef.current) return;
      /**
       * Fixes issue with iframes affecting mouseover event. https://stackoverflow.com/q/32885485/6789071
       * logic is to put off pointer events on embed iframe while resizing
       */
      childrenWrapperRef.current.style.pointerEvents = "none";

      let newWidth;
      let newHeight;
      const { left, right, top } = divRef.current.getBoundingClientRect();

      switch (direction) {
        case "right":
          newWidth = Math.ceil(mouseMoveEvt.pageX - left);
          break;
        case "left":
          newWidth = Math.ceil(right - mouseMoveEvt.pageX);
          break;
        case "bottom":
          newHeight = Math.ceil(mouseMoveEvt.pageY - top);
          break;
        case "bottom-right":
          newHeight = Math.ceil(mouseMoveEvt.pageY - top);
          newWidth = Math.ceil(mouseMoveEvt.pageX - left);
          break;
        case "bottom-left":
          newHeight = Math.ceil(mouseMoveEvt.pageY - top);
          newWidth = Math.ceil(right - mouseMoveEvt.pageX);
          break;
        default:
          break;
      }

      if (newWidth && newHeight) {
        updateLocalDimensions({ width: newWidth, height: newHeight });
        return;
      }

      if (newWidth) {
        updateLocalDimensions({ width: newWidth, aspectRatio });
        return;
      }

      if (newHeight) {
        updateLocalDimensions({ height: newHeight, aspectRatio });
      }
    }

    function onMouseUp() {
      if (!childrenWrapperRef.current) return;
      childrenWrapperRef.current.style.pointerEvents = "auto";
      document.removeEventListener("mousemove", onMouseMove);

      setTimeout(() => {
        if (!divRef.current) return;
        const { width: newWidth, height: newHeight } =
          divRef.current.getBoundingClientRect();
        updateDimensions(newWidth, newHeight);
      }, 500);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const resizerPositions = useMemo(
    () =>
      BLOCK_RESIZER_POSITIONS.filter(({ position }) =>
        aspectRatio ? !position.includes("bottom") : true
      ),
    [aspectRatio]
  );

  return (
    <div ref={divRef} className={tw`relative flex group`}>
      <div
        className={tw`absolute top-0 left-0 w-full h-full`}
        ref={childrenWrapperRef}
      >
        {children}
      </div>
      {resizerPositions.map(({ position, className }) => {
        if (["bottom-left", "bottom-right"].includes(position)) {
          return (
            <button
              type="button"
              className={tw`transition-all absolute z-10 opacity-0 group-hover:opacity-100 focus:outline-none ${className}`}
              onMouseDown={(evt) => handleResize(evt, position)}
            >
              <CornerResize position={position} />
            </button>
          );
        }

        return (
          <button
            key={position}
            style={{ maxHeight: "50%" }}
            aria-label={`${position} resize button`}
            type="button"
            className={tw`transition-all absolute border-1 border-white rounded-full bg-black bg-opacity-70 z-10 opacity-0 focus:outline-none group-hover:opacity-100 ${className}`}
            onMouseDown={(evt) => handleResize(evt, position)}
          />
        );
      })}
    </div>
  );
};
