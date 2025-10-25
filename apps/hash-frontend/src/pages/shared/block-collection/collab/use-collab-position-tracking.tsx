import { useWindowEvent } from "@mantine/hooks";
import { useCallback } from "react";

import { useDocumentEvent } from "../../../../components/hooks/use-document-event";
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
  useWindowEvent("blur", () => {
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
  useWindowEvent("focus", handleInteraction);
  useDocumentEvent("selectionchange", handleInteraction);

  /**
   * @todo capture tabindex movements
   * @see https://linear.app/hash/issue/H-3002
   */
};
