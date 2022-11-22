import {
  DataEditorProps,
  isObjectEditorCallbackResult,
  Item,
} from "@glideapps/glide-data-grid";
import { useScrollLock } from "@hashintel/hash-design-system";
import { PropsWithChildren } from "react";
import { InteractableManager } from "./interactable-manager";

const ScrollLockWrapper = ({ children }: PropsWithChildren) => {
  useScrollLock(true);

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
  tableId: string,
): DataEditorProps["customRenderers"] => {
  return customRenderers?.map(
    ({ draw, provideEditor, onClick, ...restFields }) => {
      return {
        ...restFields,
        draw: (args, cell) => draw({ ...args, tableId }, cell),
        onClick: (args) => {
          /** @todo investigate why `args` don't have `location` in it's type  */
          const [col, row] = (args as unknown as { location: Item }).location;

          const wasClickHandledByManager = InteractableManager.handleClick(
            `${tableId}-${col}-${row}`,
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
