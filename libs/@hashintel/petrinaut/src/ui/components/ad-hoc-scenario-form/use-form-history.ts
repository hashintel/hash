import { useRef } from "react";

import type { AdHocScenarioState } from "@hashintel/petrinaut-core";

/** Edits closer together than this coalesce into one undo step. */
const COALESCE_MS = 600;
const HISTORY_LIMIT = 100;

export interface AdHocFormHistory {
  /** Routes an edit to the caller's `onChange`, recording it for undo. */
  change: (next: AdHocScenarioState) => void;
  /**
   * Capture-phase key handler for the form root: Cmd/Ctrl+Z undoes,
   * Shift+Cmd/Ctrl+Z or Ctrl+Y redoes. Keys inside a text field or a Monaco
   * editor pass through — those own their own undo stacks while open.
   */
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Form-level undo/redo over the whole `AdHocScenarioState`. The form stays
 * controlled: undo and redo replay snapshots through the caller's `onChange`,
 * so the caller keeps owning the state. Bursts of changes (typing in an open
 * expression editor) coalesce into one step.
 */
export function useAdHocFormHistory(
  state: AdHocScenarioState,
  onChange: (state: AdHocScenarioState) => void,
): AdHocFormHistory {
  const historyRef = useRef<{
    past: AdHocScenarioState[];
    future: AdHocScenarioState[];
    lastEditAt: number;
  }>({ past: [], future: [], lastEditAt: 0 });

  const change = (next: AdHocScenarioState) => {
    const history = historyRef.current;
    const now = Date.now();
    if (now - history.lastEditAt > COALESCE_MS) {
      history.past.push(state);
      if (history.past.length > HISTORY_LIMIT) {
        history.past.shift();
      }
    }
    history.future = [];
    history.lastEditAt = now;
    onChange(next);
  };

  const undo = () => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (previous === undefined) {
      return;
    }
    history.future.push(state);
    history.lastEditAt = 0;
    onChange(previous);
  };

  const redo = () => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (next === undefined) {
      return;
    }
    history.past.push(state);
    history.lastEditAt = 0;
    onChange(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.closest(".monaco-editor") !== null
    ) {
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      undo();
    } else if (key === "z" || (key === "y" && event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      redo();
    }
  };

  return { change, handleKeyDown };
}
