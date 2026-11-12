import { createContext, type RefObject, useContext } from "react";

import type { PushToStackFn } from "./types";

type SlideStackContextData = {
  closeSlideStack: () => void;
  currentSlideRef?: RefObject<HTMLDivElement | null>;
  pushToSlideStack: PushToStackFn;
  setSlideContainerRef: (ref: RefObject<HTMLDivElement | null> | null) => void;
  slideContainerRef?: RefObject<HTMLDivElement | null> | null;
  /**
   * How many slides are open — overlays beneath the stack compare this
   * against the depth they mounted at to tell their own dismissals from
   * interactions with a slide stacked above them
   */
  slideStackDepth: number;
  /**
   * How many stacked data-type editor drawers are open — the same
   * mounted-depth comparison for drawers, which stack outside the slide items
   */
  dataTypeDrawerDepth: number;
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
