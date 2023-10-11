import { useCallback } from "react";
import { useDocumentEventListener, useWindowEventListener } from "rooks";

import { componentViewTargetSelector } from "../component-view";
import type { CollabPositionReporter } from "./use-collab-position-reporter";

const closestElement = (node: Node | null | undefined): Element | null =>
  !node ? null : node.nodeType === 1 ? (node as Element) : node.parentElement;

/**
 * used to capture and report user focus. this requires toplevel blocks (ComponentView instances)
 * to set `data-entity-id` on their DOM target nodes.
 *
 * note:
 *   this implementation is less trivial than one might expect because
 *   a) focus[in|out] events do not fire on any [contenteditable] elements and
 *   b) cross-origin policies restrict interactions w/ iframes
 */
export const useCollabPositionTracking = (report: CollabPositionReporter) => {
  /**
   * capture focus on sandboxed blocks (iframe)
   *
   * the handler must be deferred until the blur event passes and updates `document.activeElement`
   * @see https://stackoverflow.com/a/28932220/1675431
   */
  useWindowEventListener("blur", () => {
    setImmediate(() => {
      const activeElement = document.activeElement;

      if (activeElement?.nodeName === "IFRAME") {
        const target = activeElement.closest(componentViewTargetSelector);
        if (target) {
          return report(target.getAttribute("data-entity-id"));
        }
      }

      report(null);
    });
  });

  /**
   * capture caret movements
   */
  const handleInteraction = useCallback(() => {
    const focusElement = closestElement(document.getSelection()?.focusNode);
    const target = focusElement?.closest(componentViewTargetSelector);
    report(target?.getAttribute("data-entity-id") ?? null);
  }, [report]);
  useWindowEventListener("focus", handleInteraction);
  useDocumentEventListener("selectionchange", handleInteraction);

  /**
   * @todo capture tabindex movements
   * @see https://app.asana.com/0/1200211978612931/1201373663718971/f
   */
};
