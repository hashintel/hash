import type { DataEditorProps } from "@glideapps/glide-data-grid";
import { isObjectEditorCallbackResult } from "@glideapps/glide-data-grid";
import { type ReactNode, type RefObject } from "react";

import { useEditBarContext } from "../../../shared/edit-bar-scroller";
import { useScrollLock } from "../../../shared/use-scroll-lock";
import { InteractableManager } from "./interactable-manager";

/**
 * Lock scrolling outside when a Grid editor overlay is open.
 *
 * Note that because the EditBarContext is set at the Layout level, it passes the `body` as the scrollable component that should be locked.
 * This doesn't apply when a grid editor is open in a drawer/slide with scroll, which _won't_ have its scroll locked.
 *
 * Fixing this requires being able to lock _both_ the body and the slide scroll, which means getting the slide element into this component somehow.
 * Or having some global context tracking which slide is open, or finding it via classes.
 *
 * The type editor slide stack is also relying on useScrollLock to lock the body.
 * The entity editor slide stack doesn't.
 *
 * @todo make the slide stacks consistent when this becomes an issue, and lock the slide scroll.
 */
const ScrollLockWrapper = ({
  children,
}: { children: ReactNode | Promise<ReactNode> }) => {
  /**
   * The editBarContext provides the node that will have vertical scroll when the page is longer than the viewport
   */
  const editBarContext = useEditBarContext();

  useScrollLock(true, editBarContext?.scrollingNode);

  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
};

/**
 * This function overrides custom renderers passed to `Grid` component
 * Extends the functionality with `InteractableManager`,
 * also wraps the provided editor with `ScrollLockWrapper`
 * @param customRenderers
 * @param tableId
 * @returns overridden customRenderers
 */
export const overrideCustomRenderers = (
  customRenderers: DataEditorProps["customRenderers"],
  tableIdRef: RefObject<string>,
): DataEditorProps["customRenderers"] => {
  return customRenderers?.map(
    ({ draw, provideEditor, onClick, ...restFields }) => {
      return {
        ...restFields,
        draw: (args, cell) =>
          draw({ ...args, tableId: tableIdRef.current }, cell),
        onClick: (args) => {
          const [colIndex, rowIndex] = args.location;

          const wasClickHandledByManager = InteractableManager.handleClick(
            `${tableIdRef.current}-${colIndex}-${rowIndex}`,
            args,
          );

          if (wasClickHandledByManager) {
            args.preventDefault();
          } else {
            onClick?.(args);
          }

          return undefined;
        },
        provideEditor: (cell) => {
          const editorProps = provideEditor?.(cell);

          return {
            ...editorProps,
            editor: (props) => {
              if (isObjectEditorCallbackResult(editorProps)) {
                return (
                  <ScrollLockWrapper>
                    {editorProps.editor(props)}
                  </ScrollLockWrapper>
                );
              }

              return null;
            },
          };
        },
      };
    },
  );
};
