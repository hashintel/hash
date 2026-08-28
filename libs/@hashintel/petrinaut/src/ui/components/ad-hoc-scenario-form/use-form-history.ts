/**
 * Redux-like editing history for the ad-hoc form. Every edit is a
 * serializable `AdHocAction` dispatched through here: the pure reducer in
 * petrinaut-core computes the next state, the caller's `onChange` keeps
 * owning it (the form stays controlled), and the history is a stack of
 * state snapshots with a cursor. Undo and redo never dispatch — they move
 * the cursor and replay the snapshot, so redo after undo restores the
 * identical state value.
 *
 * Consecutive dispatches whose `adHocActionCoalescingKey` matches (typing
 * in one slot) collapse into one entry. The key match is identity-based,
 * not time-based, and breaks on undo/redo or an external state change, so
 * a burst never merges into an entry the user has already navigated to.
 *
 * The history is ephemeral: it lives with the form instance and dies with
 * the drawer that hosts it.
 */

import { useState } from "react";

import {
  adHocActionCoalescingKey,
  applyAdHocAction,
} from "@hashintel/petrinaut-core";

import { useLatest } from "../../../react/hooks/use-latest";

import type {
  AdHocAction,
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

const HISTORY_LIMIT = 100;

interface HistoryEntry {
  state: AdHocScenarioState;
  /** ISO timestamp of the edit that created the entry. */
  timestamp: string;
}

interface HistoryModel {
  entries: HistoryEntry[];
  /** The entry the form currently shows. */
  cursor: number;
  /**
   * The coalescing key of the entry at the cursor, set only when the last
   * movement was a dispatch — undo/redo and external changes clear it, so
   * the next dispatch starts a fresh entry.
   */
  hotKey: string | null;
}

export interface AdHocFormHistory {
  /** Applies one action and records the step for undo. */
  dispatch: (action: AdHocAction) => void;
  /** Moves the cursor back and replays that snapshot; never dispatches. */
  undo: () => void;
  /** Moves the cursor forward and replays that snapshot; never dispatches. */
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** One entry per undo step, oldest first, mirroring `UndoRedoContext`. */
  history: { timestamp: string }[];
  currentIndex: number;
  /** Jumps the cursor to any recorded step. */
  goToIndex: (index: number) => void;
  /**
   * Capture-phase key handler for the form root: Cmd/Ctrl+Z undoes,
   * Shift+Cmd/Ctrl+Z or Ctrl+Y redoes. Keys inside a text field or a Monaco
   * editor pass through — those own their own undo stacks while open.
   */
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/** Truncates any redo tail and pushes a fresh entry; the burst goes cold. */
function appendEntry(
  model: HistoryModel,
  state: AdHocScenarioState,
): HistoryModel {
  const kept = model.entries.slice(0, model.cursor + 1);
  const entries = [
    ...(kept.length >= HISTORY_LIMIT ? kept.slice(1) : kept),
    { state, timestamp: new Date().toISOString() },
  ];
  return { entries, cursor: entries.length - 1, hotKey: null };
}

export function useAdHocFormHistory(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  onChange: (state: AdHocScenarioState) => void,
): AdHocFormHistory {
  const [model, setModel] = useState<HistoryModel>(() => ({
    entries: [{ state, timestamp: new Date().toISOString() }],
    cursor: 0,
    hotKey: null,
  }));

  // The invariant is `entries[cursor].state === state`; every dispatch,
  // undo, and redo maintains it. A mismatch means the parent changed the
  // state externally — record that as a fresh step (render-adjusted state,
  // no effect involved).
  if (model.entries[model.cursor]!.state !== state) {
    setModel(appendEntry(model, state));
  }

  const stateRef = useLatest(state);

  const dispatch = (action: AdHocAction) => {
    // Through the latest-state ref: a dispatch can fire from an async
    // continuation (the format-on-commit round-trip), and applying it to a
    // render-closure snapshot would overwrite edits made meanwhile.
    const latest = stateRef.current;
    const next = applyAdHocAction(latest, context, action);
    if (next === latest) {
      return;
    }
    const key = adHocActionCoalescingKey(action);
    setModel((current) => {
      const atTop = current.cursor === current.entries.length - 1;
      if (key !== null && key === current.hotKey && atTop) {
        // Extend the burst: replace the top snapshot, keep its timestamp.
        const entries = [...current.entries];
        entries[current.cursor] = {
          state: next,
          timestamp: entries[current.cursor]!.timestamp,
        };
        return { ...current, entries };
      }
      return { ...appendEntry(current, next), hotKey: key };
    });
    onChange(next);
  };

  const goToIndex = (index: number) => {
    const target = model.entries[index];
    if (!target || index === model.cursor) {
      return;
    }
    setModel({ ...model, cursor: index, hotKey: null });
    onChange(target.state);
  };

  const undo = () => goToIndex(model.cursor - 1);
  const redo = () => goToIndex(model.cursor + 1);

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

  return {
    dispatch,
    undo,
    redo,
    canUndo: model.cursor > 0,
    canRedo: model.cursor < model.entries.length - 1,
    history: model.entries.map(({ timestamp }) => ({ timestamp })),
    currentIndex: model.cursor,
    goToIndex,
    handleKeyDown,
  };
}
