import {
  DataEditorProps,
  isObjectEditorCallbackResult,
  Item,
} from "@glideapps/glide-data-grid";
import { useScrollLock } from "@hashintel/design-system";
import { MutableRefObject, PropsWithChildren } from "react";

import { useEditBarContext } from "../../../shared/edit-bar-scroller";
import { InteractableManager } from "./interactable-manager";

const ScrollLockWrapper = ({ children }: PropsWithChildren) => {
  /**
   * We're locking scroll on `main` element,
   * because our table components are rendered inside `LayoutWithSidebar`.
   * Which has the overflow-y happening on `main` instead of `body` or `html`
   * So we need to lock `main` elements scroll when grid editors are visible
   * */

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
  tableIdRef: MutableRefObject<string>,
): DataEditorProps["customRenderers"] => {
  return customRenderers?.map(
    ({ draw, provideEditor, onClick, ...restFields }) => {
      return {
        ...restFields,
        draw: (args, cell) =>
          draw({ ...args, tableId: tableIdRef.current }, cell),
        onClick: (args) => {
          /** @todo investigate why `args` don't have `location` in it's type  */
          const [colIndex, rowIndex] = (args as unknown as { location: Item })
            .location;

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
            editor: (props, context) => {
              if (isObjectEditorCallbackResult(editorProps)) {
                return (
                  <ScrollLockWrapper>
                    {editorProps.editor(props, context)}
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
