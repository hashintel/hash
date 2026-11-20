import type { usePetrinautNavigation } from "../../navigation";
import type { EditorActions } from "../editor-context";
import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";

export type Navigate = ReturnType<typeof usePetrinautNavigation>["navigate"];

type SelectionUpdate = (selection: SelectionMap) => SelectionMap;

export const selectionFromNavigation = (
  items: readonly SelectionItem[],
): SelectionMap => new Map(items.map((item) => [item.id, item]));

export const selectionToNavigation = (selection: SelectionMap) =>
  Array.from(selection.values());

/**
 * Writes selection changes to the location. The changes React Flow reports in
 * one event become one navigation, and the navigations of one pointer gesture
 * say so in their intent, so a host records the gesture as one history entry.
 */
export const createSelectionNavigator = (navigate: Navigate) => {
  let gesture = { active: false, hasNavigated: false };
  let queued: SelectionUpdate[] = [];
  let flushScheduled = false;
  let listening = true;

  const navigateSelection = (
    updates: SelectionUpdate[],
    cause: "user" | "normalization",
  ) => {
    const didNavigate = navigate(
      (current) => ({
        ...current,
        selection: selectionToNavigation(
          updates.reduce(
            (selection, update) => update(selection),
            selectionFromNavigation(current.selection),
          ),
        ),
      }),
      cause === "normalization"
        ? { cause, action: "selection" }
        : {
            cause,
            action: "selection",
            phase: gesture.active
              ? gesture.hasNavigated
                ? "continue"
                : "start"
              : "discrete",
          },
    );
    if (didNavigate && cause === "user" && gesture.active) {
      gesture.hasNavigated = true;
    }
  };

  const flush = () => {
    flushScheduled = false;
    const updates = queued;
    queued = [];
    if (updates.length > 0 && listening) {
      navigateSelection(updates, "user");
    }
  };

  const setSelection: EditorActions["setSelection"] = (
    selectionOrUpdater,
    options,
  ) => {
    const update =
      typeof selectionOrUpdater === "function"
        ? selectionOrUpdater
        : () => selectionOrUpdater;

    if (!options) {
      navigateSelection([update], "user");
    } else if ("cause" in options) {
      navigateSelection([update], "normalization");
    } else {
      queued.push(update);
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }
    }
  };

  // React Flow delivers a gesture's final selection change in the same event
  // as its end callback, and the change flushes in a microtask. Flush it while
  // the gesture still counts as active, so the gesture's last commit is a
  // continuation rather than a separate discrete history entry.
  const endSelectionGesture = () => {
    flush();
    gesture = { active: false, hasNavigated: false };
  };

  return {
    setSelection,
    beginSelectionGesture: () => {
      gesture = { active: true, hasNavigated: false };
    },
    endSelectionGesture,
    /**
     * Ends a gesture whose end the canvas never reports, and stops queued
     * changes from navigating once the editor is gone. Returns the cleanup.
     */
    listen: () => {
      listening = true;
      window.addEventListener("pointerup", endSelectionGesture);
      window.addEventListener("pointercancel", endSelectionGesture);
      window.addEventListener("blur", endSelectionGesture);
      return () => {
        listening = false;
        queued = [];
        endSelectionGesture();
        window.removeEventListener("pointerup", endSelectionGesture);
        window.removeEventListener("pointercancel", endSelectionGesture);
        window.removeEventListener("blur", endSelectionGesture);
      };
    },
  };
};
