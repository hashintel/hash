import { Backdrop, Box, Slide, Stack } from "@mui/material";
import type {
  Dispatch,
  FunctionComponent,
  RefObject,
  SetStateAction,
} from "react";
import { useCallback, useMemo, useState } from "react";

import { useScrollLock } from "../../shared/use-scroll-lock";
import type { CustomEntityLinksColumn } from "../@/[shortname]/entities/[entity-uuid].page/entity-editor";
import { SlideStackContext } from "./slide-stack/context";
import { DataTypeSlide } from "./slide-stack/data-type-slide";
import { EntitySlide } from "./slide-stack/entity-slide";
import { EntityTypeSlide } from "./slide-stack/entity-type-slide";
import {
  backForwardHeight,
  SlideBackForwardCloseBar,
} from "./slide-stack/slide-back-forward-close-bar";
import type { SlideItem } from "./slide-stack/types";

export { useSlideStack } from "./slide-stack/context";

const SLIDE_WIDTH = 1_000;

const StackSlide = ({
  item,
  open,
  onBack,
  onClose,
  onForward,
  slideContainerRef,
  stackPosition,
}: {
  item: SlideItem;
  open: boolean;
  onBack?: () => void;
  onClose: () => void;
  onForward?: () => void;
  slideContainerRef: RefObject<HTMLDivElement | null> | null;
  stackPosition: number;
}) => {
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
          height: "100vh",
          width: SLIDE_WIDTH,
          position: "absolute",
          top: 0,
          right: 0,
          overflowY: "auto",
          zIndex: ({ zIndex }) => zIndex.drawer + 2 + stackPosition,
          background: ({ palette }) => palette.gray[10],
        }}
      >
        <SlideBackForwardCloseBar
          onBack={onBack ? handleBackClick : undefined}
          onForward={onForward}
          onClose={onClose}
        />

        {item.kind === "dataType" && <DataTypeSlide dataTypeId={item.itemId} />}
        {item.kind === "entityType" && (
          <EntityTypeSlide typeUrl={item.itemId} />
        )}
        {item.kind === "entity" && (
          <EntitySlide {...item} entityId={item.itemId} />
        )}
      </Box>
    </Slide>
  );
};

export const SlideStack: FunctionComponent<{
  currentIndex: number;
  items: SlideItem[];
  setCurrentIndex: Dispatch<SetStateAction<number>>;
  setItems: (items: SlideItem[]) => void;
  slideContainerRef: RefObject<HTMLDivElement | null> | null;
}> = ({
  currentIndex,
  items,
  setCurrentIndex,
  setItems,
  slideContainerRef,
}) => {
  const [animateOut, setAnimateOut] = useState(false);

  useScrollLock(items.length > 0);

  const handleBack = useCallback(() => {
    setCurrentIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  }, [setCurrentIndex]);

  const handleForward = useCallback(() => {
    setCurrentIndex((prevIndex) => Math.min(prevIndex + 1, items.length - 1));
  }, [items.length, setCurrentIndex]);

  const handleClose = useCallback(() => {
    setAnimateOut(true);

    setTimeout(() => {
      setAnimateOut(false);
      setItems([]);
    }, 200);
  }, [setAnimateOut, setItems]);

  return (
    <Backdrop
      open={items.length > 0 && !animateOut}
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
          slideContainerRef={slideContainerRef}
          stackPosition={index}
        />
      ))}
    </Backdrop>
  );
};

export const SlideStackProvider = ({
  children,
  customEntityLinksColumns,
}: {
  children: React.ReactNode;
  customEntityLinksColumns?: CustomEntityLinksColumn[];
}) => {
  const [items, setItems] = useState<SlideItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [slideContainerRef, setSlideContainerRef] =
    useState<RefObject<HTMLDivElement | null> | null>(null);

  if (currentIndex > 0 && items.length === 0) {
    setCurrentIndex(0);
  }

  const pushToSlideStack = useCallback(
    (item: SlideItem) => {
      setItems((prev) => [...prev.slice(0, currentIndex + 1), item]);

      if (items.length === 0) {
        setCurrentIndex(0);
      } else {
        setCurrentIndex((prevIndex) => prevIndex + 1);
      }
    },
    [currentIndex, items.length],
  );

  const value = useMemo(
    () => ({
      customEntityLinksColumns,
      pushToSlideStack,
      setSlideContainerRef,
      slideContainerRef,
    }),
    [
      customEntityLinksColumns,
      pushToSlideStack,
      setSlideContainerRef,
      slideContainerRef,
    ],
  );

  return (
    <SlideStackContext.Provider value={value}>
      {children}
      <SlideStack
        currentIndex={currentIndex}
        items={items}
        setCurrentIndex={setCurrentIndex}
        setItems={setItems}
        slideContainerRef={slideContainerRef}
      />
    </SlideStackContext.Provider>
  );
};
