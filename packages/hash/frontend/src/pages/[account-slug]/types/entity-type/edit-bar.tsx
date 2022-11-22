import { faSmile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Collapse, Container, Stack, Typography } from "@mui/material";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useFormState } from "react-hook-form";
import { PencilSimpleLine } from "../../../../shared/icons/svg";
import { Button, ButtonProps } from "../../../../shared/ui/button";
import { EntityTypeEditorForm } from "./form-types";

const useFrozenValue = <T extends any>(value: T): T => {
  const { isDirty } = useFormState<EntityTypeEditorForm>();

  const [frozen, setFrozen] = useState(value);

  if (isDirty && frozen !== value) {
    setFrozen(value);
  }

  return frozen;
};

// @todo disabled button styles
const EditBarContents = ({
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
  const { isSubmitting } = useFormState<EntityTypeEditorForm>();

  const frozenSubmitting = useFrozenValue(isSubmitting);

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
          disabled={frozenSubmitting}
          {...discardButtonProps}
        >
          {discardButtonProps.children}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          type="submit"
          loading={frozenSubmitting}
          loadingWithoutText
          disabled={frozenSubmitting}
          {...confirmButtonProps}
        >
          {confirmButtonProps.children}
        </Button>
      </Stack>
    </Container>
  );
};

/**
 * The edit bar transitions its height in and out which can cause the contents
 * under it to shift position. This can provide a bad experience. This hook
 * uses a resize observer to shift the page to compensate for the increased
 * offset of content underneath the edit bar to keep elements in *roughly* the
 * same position.
 */
const useFreezeScrollWhileTransitioning = () => {
  const observerRef = useRef<ResizeObserver | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const docNode = document.documentElement;
    const node = ref.current;

    if (!node) {
      return;
    }

    let beginningHeight = 0;
    let appliedOffset = 0;

    // Transition events bubble – needs to be the right event
    const isRelevant = (evt: TransitionEvent) =>
      evt.target === node && evt.propertyName === "height";

    const applyOffset = (currentHeight: number) => {
      const offset = currentHeight - beginningHeight;
      // We can't adjust further that the scroll position, or you'll see a blank
      // space at the top. In this event, we'll compensate for the difference
      // so far as we can
      appliedOffset = Math.min(0 - offset, docNode.scrollTop);

      // Adjust the whole page to compensate for the current offset caused by the
      // edit bar height
      docNode.style.setProperty("top", `${appliedOffset}px`);
      console.log(appliedOffset);
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
        console.log(window.getComputedStyle(node).height);
        // applyOffset(window.getComputedStyle(node));
        setTimeout(() => {
          node.removeEventListener("transitionend", end);
          node.removeEventListener("transitioncancel", end);
          observer.unobserve(node);

          // Before we start our calculations, remove the applied offset
          docNode.style.removeProperty("top");
          docNode.style.removeProperty("position");

          // If the page isn't long enough to scroll to compensate for the removed
          // offset, we want to apply some extra padding using min height
          const { scrollTop, clientHeight, scrollHeight } = docNode;
          const bottomPadding =
            (scrollHeight - scrollTop - clientHeight + appliedOffset) * -1;

          if (bottomPadding > 0) {
            docNode.style.setProperty(
              "min-height",
              `${Math.ceil(clientHeight - appliedOffset)}px`,
            );
          } else {
            docNode.style.removeProperty("min-height");
          }

          // Now that the transition has finished, we want to adjust the scroll to
          // compensate for the offset we've just removed
          docNode.style.setProperty("scroll-behavior", "auto");
          docNode.scrollTo({
            top: scrollTop - appliedOffset,
          });
          docNode.style.removeProperty("scroll-behavior");
        }, 0);
      }
    };

    const start = (evt: TransitionEvent) => {
      if (isRelevant(evt)) {
        const rect = node.getBoundingClientRect();

        // If the user has scrolled far enough the edit bar is off-screen, the
        // browser will compensate for us. We only need to compensate if
        // a part of the edit bar currently is, or will be, on screen
        if (rect.top + rect.height > 0) {
          beginningHeight = rect.height;
          appliedOffset = 0;

          // The resize observer will shift the page to compensate for any offset,
          // but we need to allow it to do that by updating the position of the
          // document
          docNode.style.setProperty("position", "relative");

          node.addEventListener("transitionend", end);
          node.addEventListener("transitioncancel", end);
          observer.observe(node);
        }
      }
    };

    node.addEventListener("transitionstart", start);

    return () => {
      end();

      // These two properties aren't necessarily reset by end
      node.removeEventListener("transitionstart", start);
      docNode.style.removeProperty("min-height");
    };
  }, []);

  return ref;
};

export const EditBar = ({
  currentVersion,
  discardButtonProps,
}: {
  currentVersion: number;
  discardButtonProps: Partial<ButtonProps>;
}) => {
  const { isDirty } = useFormState<EntityTypeEditorForm>();
  const frozenVersion = useFrozenValue(currentVersion);
  const ref = useFreezeScrollWhileTransitioning();

  const collapseIn = currentVersion === 0 || isDirty;

  return (
    <Box position="relative" overflow="visible">
      <Box sx={{ position: "absolute", bottom: 0, width: "100%" }}>
        <Collapse in={collapseIn} ref={ref}>
          <Box
            sx={(theme) => ({
              height: 66,
              backgroundColor: theme.palette.blue[70],
              color: theme.palette.white,
              display: "flex",
              alignItems: "center",
            })}
          >
            {frozenVersion === 0 ? (
              <EditBarContents
                icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
                title="Currently editing"
                label="- this type has not yet been created"
                discardButtonProps={{
                  children: "Discard this type",
                  ...discardButtonProps,
                }}
                confirmButtonProps={{
                  children: "Create",
                }}
              />
            ) : (
              <EditBarContents
                icon={<PencilSimpleLine />}
                title="Currently editing"
                label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
                discardButtonProps={{
                  children: "Discard changes",
                  ...discardButtonProps,
                }}
                confirmButtonProps={{
                  children: "Publish update",
                }}
              />
            )}
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
};
