import type { VersionedUrl } from "@blockprotocol/type-system";
import { Backdrop } from "@mui/material";
import type { FunctionComponent, RefObject } from "react";
import { useCallback, useState } from "react";

import { useScrollLock } from "../../../shared/use-scroll-lock";
import { TypeSlideOverSlide } from "./type-slide-over-stack/type-slide-over-slide";

export const TypeSlideOverStack: FunctionComponent<{
  rootTypeId: VersionedUrl;
  onClose: () => void;
  /**
   * If a container ref is provided, the slide will be attached to it (defaults to the MUI default, the body)
   */
  slideContainerRef?: RefObject<HTMLDivElement | null>;
}> = ({ rootTypeId, onClose, slideContainerRef }) => {
  const [animateOut, setAnimateOut] = useState(false);
  const [items, setItems] = useState<VersionedUrl[]>([rootTypeId]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  useScrollLock(true);

  if (rootTypeId !== items[0]) {
    setCurrentIndex(0);
    setItems([rootTypeId]);
  }

  const handleBack = useCallback(() => {
    setCurrentIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  }, []);

  const handleForward = useCallback(() => {
    setCurrentIndex((prevIndex) => Math.min(prevIndex + 1, items.length - 1));
  }, [items.length]);

  const handleNavigateToType = useCallback(
    (url: VersionedUrl) => {
      setItems((prev) => [...prev.slice(0, currentIndex + 1), url]);
      setCurrentIndex((prevIndex) => prevIndex + 1);
    },
    [currentIndex],
  );

  const handleClose = useCallback(() => {
    setAnimateOut(true);

    setTimeout(() => {
      setAnimateOut(false);
      setItems([]);
      onClose();
    }, 200);
  }, [setAnimateOut, setItems, onClose]);

  return (
    <Backdrop
      open={!animateOut}
      onClick={handleClose}
      sx={{ zIndex: ({ zIndex }) => zIndex.drawer + 2 }}
    >
      {items.slice(0, currentIndex + 1).map((typeId, index) => (
        <TypeSlideOverSlide
          // eslint-disable-next-line react/no-array-index-key
          key={`${index}-${typeId}`}
          open={!animateOut}
          onBack={index > 0 ? handleBack : undefined}
          onForward={index < items.length - 1 ? handleForward : undefined}
          onClose={handleClose}
          onNavigateToType={handleNavigateToType}
          slideContainerRef={slideContainerRef}
          typeUrl={typeId}
          stackPosition={index}
        />
      ))}
    </Backdrop>
  );
};
