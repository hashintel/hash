import { Backdrop, Box, Slide } from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback, useState } from "react";

import { useScrollLock } from "../../shared/use-scroll-lock";
import { DataTypeSlide } from "./slide-stack/data-type-slide";
import { EntitySlide } from "./slide-stack/entity-slide";
import { EntityTypeSlide } from "./slide-stack/entity-type-slide";
import { SlideBackForwardCloseBar } from "./slide-stack/slide-back-forward-close-bar";
import type { CommonSlideProps, SlideItem } from "./slide-stack/types";

const SLIDE_WIDTH = 1_000;

const StackSlide = ({
  hideOpenInNew,
  isReadOnly,
  item,
  open,
  onBack,
  onClose,
  onForward,
  pushToStack,
  slideContainerRef,
  stackPosition,
}: {
  item: SlideItem;
  open: boolean;
  onBack?: () => void;
  onClose: () => void;
  onForward?: () => void;
  stackPosition: number;
} & CommonSlideProps) => {
  const [animateOut, setAnimateOut] = useState(false);

  const handleBackClick = useCallback(() => {
    setAnimateOut(true);
    setTimeout(() => {
      setAnimateOut(false);
      onBack?.();
    }, 300);
  }, [setAnimateOut, onBack]);

  return (
    <Slide
      container={slideContainerRef?.current ?? undefined}
      in={open && !animateOut}
      direction="left"
      onClick={(event) => event.stopPropagation()}
    >
      <Box
        sx={{
          height: 1,
          width: SLIDE_WIDTH,
          background: "white",
          position: "absolute",
          top: 0,
          right: 0,
          overflowY: "auto",
          zIndex: ({ zIndex }) => zIndex.drawer + 2 + stackPosition,
        }}
      >
        <SlideBackForwardCloseBar
          onBack={onBack ? handleBackClick : undefined}
          onForward={onForward}
          onClose={onClose}
        />
        {item.type === "dataType" && (
          <DataTypeSlide
            dataTypeId={item.itemId}
            hideOpenInNew={hideOpenInNew}
            isReadOnly={isReadOnly}
            pushToStack={pushToStack}
          />
        )}
        {item.type === "entityType" && (
          <EntityTypeSlide
            isReadOnly={isReadOnly}
            pushToStack={pushToStack}
            typeUrl={item.itemId}
          />
        )}
        {item.type === "entity" && (
          <EntitySlide
            {...item}
            entityId={item.itemId}
            hideOpenInNew={hideOpenInNew}
            isReadOnly={isReadOnly}
            pushToStack={pushToStack}
          />
        )}
      </Box>
    </Slide>
  );
};

export const SlideStack: FunctionComponent<
  {
    rootItem: SlideItem;
    onClose: () => void;
  } & Omit<CommonSlideProps, "pushToStack">
> = ({ rootItem, onClose, ...props }) => {
  const [animateOut, setAnimateOut] = useState(false);
  const [items, setItems] = useState<SlideItem[]>([rootItem]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  useScrollLock(true);

  if (rootItem.itemId !== items[0]?.itemId) {
    setCurrentIndex(0);
    setItems([rootItem]);
  }

  const handleBack = useCallback(() => {
    setCurrentIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  }, []);

  const handleForward = useCallback(() => {
    setCurrentIndex((prevIndex) => Math.min(prevIndex + 1, items.length - 1));
  }, [items.length]);

  const pushToStack = useCallback(
    (item: SlideItem) => {
      setItems((prev) => [...prev.slice(0, currentIndex + 1), item]);
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
      {items.slice(0, currentIndex + 1).map((item, index) => (
        <StackSlide
          // eslint-disable-next-line react/no-array-index-key
          key={`${index}-${item.itemId}`}
          item={item}
          open={!animateOut}
          onBack={index > 0 ? handleBack : undefined}
          onForward={index < items.length - 1 ? handleForward : undefined}
          onClose={handleClose}
          pushToStack={pushToStack}
          stackPosition={index}
          {...props}
        />
      ))}
    </Backdrop>
  );
};
