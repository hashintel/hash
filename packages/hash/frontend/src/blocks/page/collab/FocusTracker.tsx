import { useDocumentEventListener, useWindowEventListener } from "rooks";
import { findParent } from "../../../lib/dom";
import { isComponentViewTarget } from "../ComponentView";

const reportPosition = (entityId: string | null) =>
  console.log("focussing", entityId);

/**
 * used to capture and report user focus. this requires toplevel blocks (ComponentView instances)
 * to set `data-entity-id` on their DOM target nodes.
 *
 * note:
 *   this implementation is less trivial than one might expect because
 *   a) focus[in|out] events do not fire on any [contenteditable] elements and
 *   b) cross-origin policies restrict interactions w/ iframes
 */
export const FocusTracker = () => {
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
        if (target) reportPosition(target.getAttribute("data-entity-id"));
      }
    });
  });

  /**
   * capture caret movements
   */
  useDocumentEventListener("selectionchange", () => {
    const focusNode = document.getSelection()?.focusNode;
    const target = findParent(focusNode, isComponentViewTarget);
    if (target) reportPosition(target.getAttribute("data-entity-id"));
  });

  /**
   * @todo capture tabindex movements
   * @see https://app.asana.com/0/1200211978612931/1201373663718971/f
   */

  return null;
};
