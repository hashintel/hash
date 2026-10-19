import { useEffect, useState } from "react";

/**
 * The tallest a file preview may be: the viewport's height, less room for the
 * page around the preview unless it is full screen.
 */
export const useFilePreviewMaxHeight = (isFullScreen: boolean) => {
  const [viewportHeight, setViewportHeight] = useState(
    document.documentElement.clientHeight,
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(document.documentElement.clientHeight);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isFullScreen ? viewportHeight : viewportHeight - 120;
};
