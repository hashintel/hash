import { isObjectEditorCallbackResult } from "@glideapps/glide-data-grid";

import { InteractableManager } from "./interactable-manager";
import { ScrollLockWrapper } from "./override-custom-renderers/scroll-lock-wrapper";

import type { DataEditorProps } from "@glideapps/glide-data-grid";
import type { RefObject } from "react";

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
