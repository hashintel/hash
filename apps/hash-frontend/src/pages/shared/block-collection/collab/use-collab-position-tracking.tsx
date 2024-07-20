import { useCallback } from "react";
import { useDocumentEventListener, useWindowEventListener } from "rooks";

import { componentViewTargetSelector } from "../component-view";

import type { CollabPositionReporter } from "./use-collab-position-reporter";

const closestElement = (node: Node | null | undefined): Element | null =>
  !node ? null : node.nodeType === 1 ? (node as Element) : node.parentElement;

/**
 * Used to capture and report user focus. This requires toplevel blocks (ComponentView instances)
 * to set `data-entity-id` on their DOM target nodes.
 *
 * Note:
 *   this implementation is less trivial than one might expect because
 *   a) focus[in|out] events do not fire on any [contenteditable] elements and
 *   b) cross-origin policies restrict interactions w/ iframes.
 */
export const useCollabPositionTracking = (report: CollabPositionReporter) => {
  /**
   * Capture focus on sandboxed blocks (iframe).
   *
   * The handler must be deferred until the blur event passes and updates `document.activeElement`.
   *
   * @see https://stackoverflow.com/a/28932220/1675431
   */
  useWindowEventListener("blur", () => {
    setImmediate(() => {
      const { activeElement } = document;

      if (activeElement?.nodeName === "IFRAME") {
        const target = activeElement.closest(componentViewTargetSelector);

        if (target) {
          report(target.getAttribute("data-entity-id"));

          return;
        }
      }

      report(null);
    });
  });

  /**
   * Capture caret movements.
   */
  const handleInteraction = useCallback(() => {
    const focusElement = closestElement(document.getSelection()?.focusNode);
    const target = focusElement?.closest(componentViewTargetSelector);

    report(target?.getAttribute("data-entity-id") ?? null);
  }, [report]);

  useWindowEventListener("focus", handleInteraction);
  useDocumentEventListener("selectionchange", handleInteraction);

  /**
   * @see https://linear.app/hash/issue/H-3002
   * @todo Capture tabindex movements.
   */
};
