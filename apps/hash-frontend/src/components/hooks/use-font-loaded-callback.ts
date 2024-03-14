import { useLayoutEffect } from "react";
import type { FontFace } from "use-font-face-observer";
import useFontFaceObserver from "use-font-face-observer";

export const useFontLoadedCallback = (
  fontList: FontFace[],
  callback?: () => void,
) => {
  const isFontListLoaded = useFontFaceObserver(fontList);

  useLayoutEffect(() => {
    if (isFontListLoaded) {
      callback?.();
    }
  }, [isFontListLoaded, callback]);

  return isFontListLoaded;
};
