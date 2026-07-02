import { useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";

import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import { TOP_CONTEXT_BAR_HEIGHT } from "../top-context-bar";
import { visualizerHeaderHeight } from "./header";

import type { RefObject } from "react";

/**
 * CSS height expressions for the visualizer content area, sized to fill the
 * viewport below the toolbar.
 *
 * Attach {@link contentTopRef} to an empty element directly above the content;
 * its measured viewport offset (kept up to date via a ResizeObserver on the
 * document) feeds the `calc()` expressions. Until the first measurement the
 * heights fall back to an estimate from the known chrome heights, so the
 * initial render is roughly right rather than zero-height.
 */
export const useVisualizerHeights = (): {
  contentTopRef: RefObject<HTMLDivElement | null>;
  /** Full remaining viewport height, used by the Graph view. */
  availableHeight: string;
  /** {@link availableHeight} clamped to 1000px, used by the Table view. */
  tableHeight: string;
} => {
  const theme = useTheme();

  const contentTopRef = useRef<HTMLDivElement>(null);
  const [contentTop, setContentTop] = useState<number | null>(null);

  useEffect(() => {
    const el = contentTopRef.current;
    if (!el) {
      return;
    }

    const measure = () => {
      setContentTop(el.getBoundingClientRect().top);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);

    return () => observer.disconnect();
  }, []);

  const availableHeight = `calc(100vh - ${
    contentTop != null
      ? `${contentTop}px - ${theme.spacing(5)}`
      : `(${
          HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 230 + visualizerHeaderHeight
        }px + ${theme.spacing(5)} + ${theme.spacing(5)}`
  })`;

  return {
    contentTopRef,
    availableHeight,
    tableHeight: `min(${availableHeight}, 1000px)`,
  };
};
