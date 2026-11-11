/**
 * A name that keeps its start and its end when space runs out: "Hold for the… sign-off". The full name shows on hover.
 */
import { useLayoutEffect, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

const textStyle = css({
  display: "block",
  flex: "1",
  minWidth: "[0]",
  overflow: "hidden",
  whiteSpace: "nowrap",
});

let canvas: HTMLCanvasElement | null = null;

const widthOf = (text: string, font: string) => {
  canvas ??= globalThis.document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return 0;
  }
  context.font = font;
  return context.measureText(text).width;
};

/** The longest "start…end" that fits, cutting the start and end in turn. */
const cutToFit = (text: string, room: number, font: string) => {
  if (widthOf(text, font) <= room) {
    return text;
  }
  let keep = text.length - 1;
  while (keep > 1) {
    const head = Math.ceil(keep / 2);
    const cut = `${text.slice(0, head).trimEnd()}…${text.slice(text.length - (keep - head)).trimStart()}`;
    if (widthOf(cut, font) <= room) {
      return cut;
    }
    keep -= 1;
  }
  return "…";
};

export const MiddleCut = ({ text }: { text: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const fit = () => {
      const style = getComputedStyle(element);
      setShown(cutToFit(text, element.clientWidth, style.font));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);
  return (
    <span ref={ref} className={textStyle} title={shown === text ? undefined : text}>
      {shown}
    </span>
  );
};
