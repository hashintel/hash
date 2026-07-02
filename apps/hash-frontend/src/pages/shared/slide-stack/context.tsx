import { createContext, type RefObject, useContext } from "react";

import type { PushToStackFn } from "./types";

type SlideStackContextData = {
  closeSlideStack: () => void;
  currentSlideRef?: RefObject<HTMLDivElement | null>;
  /** Whether any slide is currently open (covering the page content below). */
  hasOpenSlides: boolean;
  pushToSlideStack: PushToStackFn;
  setSlideContainerRef: (ref: RefObject<HTMLDivElement | null> | null) => void;
  slideContainerRef?: RefObject<HTMLDivElement | null> | null;
};

export const SlideStackContext = createContext<SlideStackContextData | null>(
  null,
);

export const useSlideStack = () => {
  const context = useContext(SlideStackContext);

  if (!context) {
    throw new Error("useSlideStack must be used within a SlideStackProvider");
  }

  return context;
};

/**
 * Where a subtree sits relative to the slide stack: on the page (`inSlide`
 * false), or inside a specific slide, which is `covered` while a later slide
 * is stacked on top of it. Provided per slide by the stack; the default is
 * the page level.
 */
interface SlideOcclusion {
  readonly inSlide: boolean;
  readonly covered: boolean;
}

export const SlideOcclusionContext = createContext<SlideOcclusion>({
  inSlide: false,
  covered: false,
});

/**
 * Whether this subtree is visually occluded by the slide stack: covered by a
 * higher slide when inside one, or behind any open slide when on the page.
 * Used to idle expensive surfaces (the graph visualizer's simulation) the
 * user cannot currently see.
 */
export const useSlideStackOcclusion = (): boolean => {
  const { hasOpenSlides } = useSlideStack();
  const { inSlide, covered } = useContext(SlideOcclusionContext);

  return inSlide ? covered : hasOpenSlides;
};
