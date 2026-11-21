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

interface HistoryModel {
  /** One state snapshot per undo step, oldest first. */
  entries: AdHocScenarioState[];
  /** The entry the form currently shows. */
  cursor: number;
  /**
   * The coalescing key of the entry at the cursor, set only when the last
   * movement was a dispatch — undo/redo and external changes clear it, so
   * the next dispatch starts a fresh entry.
   */
  hotKey: string | null;
}

interface AdHocFormHistory {
  /**
   * Applies one action, or a batch of actions as one step, and records the
   * step for undo.
   */
  dispatch: (action: AdHocAction | AdHocAction[]) => void;
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
    state,
  ];
  return { entries, cursor: entries.length - 1, hotKey: null };
}

export function useAdHocFormHistory(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
  onChange: (state: AdHocScenarioState) => void,
  /**
   * Whether the host owns part of the state and recomputes it from the
   * form's own edits. In run mode the computed parameters and marking are
   * derived, so they belong to the host rather than to the undo stack: an
   * external change adopts in place instead of adding a step. Recorded as a
   * step, an edit would land twice (the value, then the preview derived
   * from it) and undo could never get back past the second one.
   */
  hostDerivesState = false,
): AdHocFormHistory {
  const [model, setModel] = useState<HistoryModel>(() => ({
    entries: [state],
    cursor: 0,
    hotKey: null,
  }));

  // The invariant is `entries[cursor] === state`; every dispatch,
  // undo, and redo maintains it. A mismatch means the parent changed the
  // state externally — record that as a fresh step (render-adjusted state,
  // no effect involved). Two kinds of mismatch are adopted in place
  // instead: a same-content rematerialization (hosts compose their state
  // per render, and a step that undoes nothing is noise), and any external
  // change at all when the host derives part of the state, because then
  // the change is the host's own answer to an edit already recorded.
  const cursorState = model.entries[model.cursor]!;
  if (cursorState !== state) {
    if (
      hostDerivesState ||
      JSON.stringify(cursorState) === JSON.stringify(state)
    ) {
      const entries = [...model.entries];
      entries[model.cursor] = state;
      setModel({ ...model, entries });
    } else {
      setModel(appendEntry(model, state));
    }
  }

  const stateRef = useLatest(state);
  // The handlers below read the latest history and the latest `onChange`
  // through refs, so they keep one identity for the form's life: they are
  // part of what the form gives every cell, and a handler that changed with
  // each edit would render every cell on each edit.
  const modelRef = useLatest(model);
  const onChangeRef = useLatest(onChange);

  const dispatch = (action: AdHocAction | AdHocAction[]) => {
    // Through the latest-state ref: a dispatch can fire from an async
    // continuation (the format-on-commit round-trip), and applying it to a
    // render-closure snapshot would overwrite edits made meanwhile.
    const latest = stateRef.current;
    // A batch is one edit to the user (a type change that also drops the
    // selection the new type cannot carry), so it is one undo step. Two
    // dispatches in one tick would both read the same `latest` and the
    // second would overwrite the first, so the actions chain here instead.
    const actions = Array.isArray(action) ? action : [action];
    let next = latest;
    for (const step of actions) {
      next = applyAdHocAction(next, context, step);
    }
    if (next === latest) {
      return;
    }
    const key = Array.isArray(action) ? null : adHocActionCoalescingKey(action);
    setModel((current) => {
      const atTop = current.cursor === current.entries.length - 1;
      if (key !== null && key === current.hotKey && atTop) {
        // Extend the burst: replace the top snapshot.
        const entries = [...current.entries];
        entries[current.cursor] = next;
        return { ...current, entries };
      }
      return { ...appendEntry(current, next), hotKey: key };
    });
    onChangeRef.current(next);
  };

  /** Moves the cursor and replays that snapshot; never dispatches. */
  const goToIndex = (index: number) => {
    const current = modelRef.current;
    const target = current.entries[index];
    if (!target) {
      return;
    }
    setModel({ ...current, cursor: index, hotKey: null });
    onChangeRef.current(target);
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
      goToIndex(modelRef.current.cursor - 1);
    } else if (key === "z" || (key === "y" && event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      goToIndex(modelRef.current.cursor + 1);
    }
  };

  return { dispatch, handleKeyDown };
}
