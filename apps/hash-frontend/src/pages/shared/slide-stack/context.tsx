import { createContext, type RefObject, useContext } from "react";

import type { PushToStackFn } from "./types";

type SlideStackContextData = {
  closeSlideStack: () => void;
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
