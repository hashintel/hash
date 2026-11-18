/**
 * @layerRoot ui.plugins.fps
 * @role A draggable browser FPS counter with a bounded local frame history
 */
import { useLayoutEffect, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { CloseIcon } from "@hashintel/ds-icons";

import { useBrowserFps } from "./counter/use-browser-fps";
import { useCounterDrag } from "./counter/use-counter-drag";

const fpsColor = (fps: number) =>
  fps >= 50 ? "#3fb950" : fps >= 30 ? "#e3b341" : "#f85149";

const closeStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  borderRadius: "[6px]",
  cursor: "pointer",
  flexShrink: 0,
  _hover: { background: "[rgba(128, 128, 128, 0.18)]" },
  _focusVisible: { outline: "[2px solid #6b8aff]", outlineOffset: "[2px]" },
});

const FpsHistory = ({ frames }: { frames: readonly number[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    const ratio = window.devicePixelRatio;
    canvas.width = 178 * ratio;
    canvas.height = 43 * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, 178, 43);
    for (let column = 0; column < 24; column++) {
      const sample = frames[frames.length - 24 + column];
      const filled =
        sample === undefined ? 0 : Math.min(6, Math.round(sample / 10));
      for (let row = 0; row < 6; row++) {
        context.fillStyle =
          sample !== undefined && row < filled
            ? fpsColor(sample)
            : "rgba(255,255,255,0.10)";
        context.fillRect(column * 7.5, 43 - (row + 1) * 7.5 + 2, 5.5, 5.5);
      }
    }
  }, [frames]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={css({ display: "block", width: "[178px]", height: "[43px]" })}
    />
  );
};

export const FpsCounter = ({ onClose }: { onClose: () => void }) => {
  const frames = useBrowserFps();
  const fps = frames.at(-1);
  const { panelRef, dragging, position, handleProps } = useCounterDrag();
  return (
    <section
      aria-label="Browser FPS counter"
      ref={panelRef}
      data-dragging={dragging || undefined}
      className={css({
        position: "absolute",
        zIndex: "banner",
        width: "[204px]",
        maxWidth: "[calc(100% - 32px)]",
        padding: "[10px 12px]",
        borderRadius: "[16px]",
        background: "[#181a20]",
        color: "[#f6f7f9]",
        colorScheme: "dark",
        border: "[1px solid rgba(255,255,255,0.10)]",
        boxShadow: "[0 6px 18px rgba(0,0,0,0.18)]",
        pointerEvents: "auto",
      })}
      style={position}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "[6px]",
          marginBottom: "[6px]",
        })}
      >
        <button
          type="button"
          aria-label="Move FPS counter"
          title="Drag to move. Arrow keys move the focused counter."
          {...handleProps}
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "[6px]",
            flex: "1",
            minWidth: "[0]",
            textAlign: "left",
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
            "[data-dragging] &": { cursor: "grabbing" },
            borderRadius: "[6px]",
            _focusVisible: {
              outline: "[2px solid #6b8aff]",
              outlineOffset: "[3px]",
            },
          })}
        >
          <span
            className={css({
              fontSize: "[20px]",
              lineHeight: "[1]",
              fontWeight: "semibold",
              fontVariantNumeric: "tabular-nums",
            })}
            style={{
              color: fps !== undefined && fps < 50 ? fpsColor(fps) : undefined,
            }}
          >
            {fps === undefined ? "–" : Math.round(fps)}
          </span>
          <span className={css({ fontSize: "[11px]", color: "[#aeb7c6]" })}>
            browser FPS
          </span>
        </button>
        <button
          type="button"
          aria-label="Hide FPS counter"
          onClick={onClose}
          className={closeStyle}
        >
          <CloseIcon size={16} />
        </button>
      </div>
      <FpsHistory frames={frames} />
    </section>
  );
};
