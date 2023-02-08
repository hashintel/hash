import {
  Box,
  Collapse,
  Container,
  Stack,
  styled,
  Typography,
} from "@mui/material";
import { ReactNode, useEffect, useRef } from "react";

import { useEditBarContext } from "../../../../../../shared/edit-bar-scroller";
import { PencilSimpleLine } from "../../../../../../shared/icons/svg";
import { Button, ButtonProps } from "../../../../../../shared/ui/button";

export const EditBarContents = ({
  icon,
  title,
  label,
  discardButtonProps,
  confirmButtonProps,
}: {
  icon: ReactNode;
  title: ReactNode;
  label: ReactNode;
  discardButtonProps: ButtonProps;
  confirmButtonProps: ButtonProps;
}) => {
  return (
    <Container
      sx={{
        display: "flex",
        alignItems: "center",
      }}
    >
      {icon}
      <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
        <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
          {title}
        </Box>{" "}
        {label}
      </Typography>
      <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
        <Button
          variant="tertiary"
          size="xs"
          sx={(theme) => ({
            borderColor: theme.palette.blue[50],
            backgroundColor: "transparent",
            color: "white",
            "&:hover": {
              backgroundColor: theme.palette.blue[80],
              color: "white",
            },
          })}
          {...discardButtonProps}
        >
          {discardButtonProps.children}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          type="submit"
          loadingWithoutText
          data-testid="editbar-confirm"
          {...confirmButtonProps}
        >
          {confirmButtonProps.children}
        </Button>
      </Stack>
    </Container>
  );
};

/**
 * THIS MUST BE KEPT IN SYNC WITH EDIT_BAR_HEIGHT IN @hashintel/design-system
 * @todo make this a prop / shared some other way
 */
export const EDIT_BAR_HEIGHT = 66;

/**
 * The edit bar transitions its height in and out which can cause the contents
 * under it to shift position. This can provide a bad experience. This hook
 * uses a resize observer to shift the page to compensate for the increased
 * offset of content underneath the edit bar to keep elements in *roughly* the
 * same position.
 */
export const useFreezeScrollWhileTransitioning = () => {
  const observerRef = useRef<ResizeObserver | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const editBarContext = useEditBarContext();

  useEffect(() => {
    const editBar = ref.current;

    if (!editBar || !editBarContext) {
      return;
    }

    const { page, scrollingNode: scroller } = editBarContext;

    let beginningHeight = 0;
    let appliedOffset = 0;

    // Transition events bubble – needs to be the right event
    const isRelevant = (evt: TransitionEvent) =>
      evt.target === editBar && evt.propertyName === "height";

    const applyOffset = (currentHeight: number) => {
      const offset = currentHeight - beginningHeight;
      // We can't adjust further that the scroll position, or you'll see a blank
      // space at the top. In this event, we'll compensate for the difference
      // so far as we can
      appliedOffset = Math.min(0 - offset, scroller.scrollTop);

      // Adjust the whole page to compensate for the current offset caused by the
      // edit bar height
      page.style.setProperty("top", `${appliedOffset}px`);
    };

    const observer = new ResizeObserver(([size]) => {
      applyOffset(size!.contentRect.height);
    });

    observerRef.current = observer;

    /**
     * Called when the transition ends or is cancelled, and when the component
     * unmounts. We should "reset" the world at this point, as far as possible.
     *
     * At the end of the transition, we reset the "top" position of the document
     * and scroll to compensate, as far as possible.
     */
    const end = (evt?: TransitionEvent) => {
      if (!evt || isRelevant(evt)) {
        applyOffset(parseInt(window.getComputedStyle(editBar).height, 10));
        editBar.removeEventListener("transitionend", end);
        editBar.removeEventListener("transitioncancel", end);
        observer.unobserve(editBar);

        // Before we start our calculations, remove the applied offset
        page.style.removeProperty("top");
        page.style.removeProperty("position");

        // If the page isn't long enough to scroll to compensate for the removed
        // offset, we want to apply some extra padding using min height
        const { scrollTop, clientHeight, scrollHeight } = scroller;
        const bottomPadding =
          (scrollHeight - scrollTop - clientHeight + appliedOffset) * -1;

        if (bottomPadding > 0) {
          page.style.setProperty(
            "min-height",
            `${Math.ceil(clientHeight - appliedOffset)}px`,
          );
        } else {
          page.style.removeProperty("min-height");
        }

        // Now that the transition has finished, we want to adjust the scroll to
        // compensate for the offset we've just removed
        scroller.style.setProperty("scroll-behavior", "auto");
        scroller.scrollTo({
          top: scrollTop - appliedOffset,
        });
        scroller.style.removeProperty("scroll-behavior");
      }
    };

    const start = (evt: TransitionEvent) => {
      /**
       * we don't need to freeze the scroll if edit bar did not started to behave as sticky yet
       * when scroll passes the height of the edit bar, it stick to the top,
       * when it sticks, we don't need to manipulate page scroll in this function,
       * because sticky element does not shift the elements while appearing / disappearing
       */
      const notStickyYet = scroller.scrollTop <= EDIT_BAR_HEIGHT;

      if (isRelevant(evt) && notStickyYet) {
        const rect = editBar.getBoundingClientRect();

        // If the user has scrolled far enough the edit bar is off-screen, the
        // browser will compensate for us. We only need to compensate if
        // a part of the edit bar currently is, or will be, on screen
        if (rect.top + rect.height > 0) {
          beginningHeight = rect.height;
          appliedOffset = 0;

          // The resize observer will shift the page to compensate for any offset,
          // but we need to allow it to do that by updating the position of the
          // document
          page.style.setProperty("position", "relative");

          editBar.addEventListener("transitionend", end);
          editBar.addEventListener("transitioncancel", end);
          observer.observe(editBar);
        }
      }
    };

    editBar.addEventListener("transitionstart", start);

    return () => {
      end();

      // These two properties aren't necessarily reset by end
      editBar.removeEventListener("transitionstart", start);
      page.style.removeProperty("min-height");
    };
  }, [editBarContext]);

  return ref;
};

export const EditBarContainer = styled(Box)(({ theme }) => ({
  height: EDIT_BAR_HEIGHT,
  backgroundColor: theme.palette.blue[70],
  color: theme.palette.white,
  display: "flex",
  alignItems: "center",
}));

export const EditBarCollapse = styled(Collapse)({
  position: "sticky",
  top: 0,
  zIndex: 100,
});

export const EditBar = ({
  discardButtonProps,
  confirmButtonProps,
  visible,
  label,
}: {
  visible: boolean;
  discardButtonProps: Partial<ButtonProps>;
  confirmButtonProps: Partial<ButtonProps>;
  label?: ReactNode;
}) => {
  const ref = useFreezeScrollWhileTransitioning();

  return (
    <EditBarCollapse in={visible} ref={ref}>
      <EditBarContainer>
        <EditBarContents
          icon={<PencilSimpleLine />}
          title="Currently editing"
          label={label}
          discardButtonProps={{
            children: "Discard changes",
            ...discardButtonProps,
          }}
          confirmButtonProps={{
            children: "Publish update",
            ...confirmButtonProps,
          }}
        />
      </EditBarContainer>
    </EditBarCollapse>
  );
};
