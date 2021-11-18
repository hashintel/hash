import { useDocumentEventListener, useWindowEventListener } from "rooks";
import { findParent } from "../../../lib/dom";
import { isComponentViewTarget } from "../ComponentView";
import type { CollabPositionReporter } from "./useCollabPositionReporter";

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
    setTimeout(() => {
      const activeElement = document.activeElement;

      if (activeElement?.nodeName === "IFRAME") {
        const target = findParent(activeElement, isComponentViewTarget);
        if (target) return report(target.getAttribute("data-entity-id"));
      }

      report(null);
    });
  });

  /**
   * capture caret movements
   */
  useDocumentEventListener("selectionchange", () => {
    const focusNode = document.getSelection()?.focusNode;
    const target = findParent(focusNode, isComponentViewTarget);
    report(target ? target.getAttribute("data-entity-id") : null);
  });

  /**
   * @todo capture tabindex movements
   * @see https://app.asana.com/0/1200211978612931/1201373663718971/f
   */
};
