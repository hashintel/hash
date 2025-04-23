import { Backdrop, Box, Portal, Slide } from "@mui/material";
import type {
  Dispatch,
  FunctionComponent,
  RefObject,
  SetStateAction,
} from "react";
import { createRef, useCallback, useMemo, useState } from "react";

import { useScrollLock } from "../../shared/use-scroll-lock";
import { SlideStackContext } from "./slide-stack/context";
import { DataTypeSlide } from "./slide-stack/data-type-slide";
import { EntitySlide } from "./slide-stack/entity-slide";
import { EntityTypeSlide } from "./slide-stack/entity-type-slide";
import { SlideBackForwardCloseBar } from "./slide-stack/slide-back-forward-close-bar";
import type { SlideItem } from "./slide-stack/types";

export { useSlideStack } from "./slide-stack/context";

const SLIDE_WIDTH = 1_000;

const StackSlide = ({
  item,
  open,
  onBack,
  onClose,
  onForward,
  removeItem,
  replaceItem,
  slideRef,
  slideContainerRef,
  stackPosition,
}: {
  item: SlideItem;
  open: boolean;
  onBack?: () => void;
  onClose: () => void;
  onForward?: () => void;
  removeItem: () => void;
  replaceItem: (item: SlideItem) => void;
  slideContainerRef: RefObject<HTMLDivElement | null> | null;
  slideRef: RefObject<HTMLDivElement | null>;
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
    >
      <Box
        ref={slideRef}
        sx={{
          height: "100%",
          width: SLIDE_WIDTH,
          position: "fixed",
          top: 0,
          right: 0,
          overflowY: "scroll",
          zIndex: ({ zIndex }) => zIndex.drawer + 2 + stackPosition,
          background: ({ palette }) => palette.gray[10],
        }}
      >
        <SlideBackForwardCloseBar
          onBack={onBack ? handleBackClick : undefined}
          onForward={onForward}
          onClose={onClose}
        />

        {item.kind === "dataType" && (
          <DataTypeSlide dataTypeId={item.itemId} replaceItem={replaceItem} />
        )}
        {item.kind === "entityType" && (
          <EntityTypeSlide replaceItem={replaceItem} typeUrl={item.itemId} />
        )}
        {item.kind === "entity" && (
          <EntitySlide
            {...item}
            entityId={item.itemId}
            removeItem={removeItem}
            replaceItem={replaceItem}
          />
        )}
      </Box>
    </Slide>
  );
};

export const SlideStack: FunctionComponent<{
  currentIndex: number;
  closeSlideStack: () => void;
  items: { item: SlideItem; ref: RefObject<HTMLDivElement | null> }[];
  replaceItem: (item: SlideItem) => void;
  removeItem: () => void;
  setItems: Dispatch<
    SetStateAction<{
      items: { item: SlideItem; ref: RefObject<HTMLDivElement | null> }[];
      currentIndex: number;
    }>
  >;
  slideContainerRef: RefObject<HTMLDivElement | null> | null;
}> = ({
  currentIndex,
  closeSlideStack,
  items,
  removeItem,
  replaceItem,
  setItems,
  slideContainerRef,
}) => {
  const [animateOut, setAnimateOut] = useState(false);

  useScrollLock(items.length > 0);

  const handleBack = useCallback(() => {
    setItems((prev) => ({
      currentIndex: Math.max(prev.currentIndex - 1, 0),
      items: prev.items,
    }));
  }, [setItems]);

  const handleForward = useCallback(() => {
    setItems((prev) => ({
      currentIndex: Math.min(prev.currentIndex + 1, items.length - 1),
      items: prev.items,
    }));
  }, [items.length, setItems]);

  const handleClose = useCallback(() => {
    setAnimateOut(true);

    setTimeout(() => {
      setAnimateOut(false);
      closeSlideStack();
    }, 200);
  }, [closeSlideStack, setAnimateOut]);

  return (
    <Portal container={slideContainerRef?.current ?? undefined}>
      <Backdrop
        onClick={(event) => {
          if (
            !items[currentIndex]?.ref.current?.contains(event.target as Node)
          ) {
            handleClose();
          }
        }}
        open={items.length > 0 && !animateOut}
        sx={{ zIndex: ({ zIndex }) => zIndex.drawer + 2 }}
      >
        {items.slice(0, currentIndex + 1).map(({ item, ref }, index) => (
          <StackSlide
            // eslint-disable-next-line react/no-array-index-key
            key={`${index}-${item.itemId}`}
            item={item}
            open={!animateOut}
            onBack={index > 0 ? handleBack : undefined}
            onForward={index < items.length - 1 ? handleForward : undefined}
            onClose={handleClose}
            removeItem={removeItem}
            replaceItem={replaceItem}
            slideRef={ref}
            slideContainerRef={slideContainerRef}
            stackPosition={index}
          />
        ))}
      </Backdrop>
    </Portal>
  );
};

export const SlideStackProvider = ({
  children,
  rewriteSlideItemOverride,
}: {
  children: React.ReactNode;
  /**
   * If provided, this function will be called with the item to be added to the slide stack.
   * It can then undergo transformations before being added to the slide stack.
   * The use case that prompted this is Flow outputs, where some entities are not in the db, and are in a 'proposed' state.
   * For these entities, we need to manually provide the subgraph to the EntitySlide.
   * The Flow outputs component (outputs.tsx) achieves this by wrapping components that might add to a stack with its own SlideStackProvider,
   * and can intercept calls for entities being added to the stack, check if they're 'proposed', and if so, provide the subgraph.
   */
  rewriteSlideItemOverride?: (item: SlideItem) => SlideItem;
}) => {
  const [{ items, currentIndex }, setItems] = useState<{
    currentIndex: number;
    items: { item: SlideItem; ref: RefObject<HTMLDivElement | null> }[];
  }>({ currentIndex: 0, items: [] });

  const [slideContainerRef, setSlideContainerRef] =
    useState<RefObject<HTMLDivElement | null> | null>(null);

  if (currentIndex > 0 && items.length === 0) {
    setItems({ currentIndex: 0, items: [] });
  }

  const pushToSlideStack = useCallback(
    (uncheckedItem: SlideItem) => {
      const item = rewriteSlideItemOverride?.(uncheckedItem) ?? uncheckedItem;

      setItems((prev) => {
        return {
          currentIndex: Math.min(prev.currentIndex + 1, prev.items.length),
          items: [
            ...prev.items.slice(0, prev.currentIndex + 1),
            { item, ref: createRef() },
          ],
        };
      });
    },
    [rewriteSlideItemOverride],
  );

  const replaceItem = useCallback((item: SlideItem) => {
    setItems((prev) => {
      return {
        currentIndex: prev.currentIndex,
        items: [...prev.items.slice(0, 1), { item, ref: createRef() }],
      };
    });
  }, []);

  const removeItem = useCallback(() => {
    setItems((prev) => {
      return {
        currentIndex: Math.max(prev.currentIndex - 1, 0),
        items: prev.items.slice(0, 1),
      };
    });
  }, []);

  const closeSlideStack = useCallback(() => {
    setItems({ currentIndex: 0, items: [] });
  }, []);

  const value = useMemo(
    () => ({
      closeSlideStack,
      currentSlideRef: items[currentIndex]?.ref,
      pushToSlideStack,
      setSlideContainerRef,
      slideContainerRef,
    }),
    [
      closeSlideStack,
      currentIndex,
      items,
      pushToSlideStack,
      setSlideContainerRef,
      slideContainerRef,
    ],
  );

  return (
    <SlideStackContext.Provider value={value}>
      {children}
      <SlideStack
        closeSlideStack={closeSlideStack}
        currentIndex={currentIndex}
        items={items}
        removeItem={removeItem}
        replaceItem={replaceItem}
        setItems={setItems}
        slideContainerRef={slideContainerRef}
      />
    </SlideStackContext.Provider>
  );
};
