import type { ReplacePortals } from "@hashintel/hash-shared/sharedWithBackend";
import { ResolvedPos } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import React, { CSSProperties } from "react";
import { ensureMounted } from "../../lib/dom";
import { BlockSuggester } from "./BlockSuggester";

interface Trigger {
  /** matched search string including its leading slash */
  search: string;
  /** starting prosemirror document position */
  from: number;
  /** ending prosemirror document position */
  to: number;
}

/**
 * used to find a string triggering the suggester plugin
 */
const findTrigger = (state: EditorState): Trigger | null => {
  // @ts-expect-error: only empty TextSelection has a $cursor
  const cursor: ResolvedPos = state.selection.$cursor;
  if (!cursor) return null;

  // the cursor's parent is the node that contains it
  const text = cursor.parent.textContent;

  // the cursor's position inside its parent
  const cursorPos = cursor.parentOffset;

  // the parent's position relative to the document root
  const parentPos = cursor.pos - cursorPos;

  // see if we can find a slash looking backwards
  const from = text.lastIndexOf("/", cursorPos - 1);
  if (from < 0) return null;

  // assert that there's no whitespace between the slash and the cursor
  const fromSlashToCursor = text.substring(from, cursorPos);
  if (/\s/.test(fromSlashToCursor)) return null;

  // match upto the first whitespace character or the end of the node
  const to = cursorPos + text.substring(cursorPos).search(/\s|$/g);

  return {
    search: text.substring(from, to),
    from: parentPos + from,
    to: parentPos + to,
  };
};

interface SuggesterState {
  /** whether or not the suggester is disabled */
  disabled: boolean;
  /** the suggester's current trigger */
  trigger: Trigger | null;
  /** current suggestion index */
  selectedIndex: number;
}

type SuggesterAction = { type: "escape" } | { type: "select"; delta: number };

/**
 * Suggester plugin factory
 *
 * Behaviour:
 * Typing a slash followed by any number of non-whitespace characters will activate the plugin and
 * open a popup right under the "textual trigger". Moving the cursor outside the trigger will close
 * the popup. Pressing the Escape-key while inside the trigger will disable the plugin until a
 * trigger is newly encountered (e.g. by leaving/deleting and reentering/retyping a trigger).
 */
export const createBlockSuggester = (replacePortal: ReplacePortals) => {
  const plugin = new Plugin<SuggesterState>({
    state: {
      init() {
        return { trigger: null, disabled: false, selectedIndex: 0 };
      },
      /** used in a reducer fashion */
      apply(tr, state, _prevEitorState, nextEditorState) {
        const action: SuggesterAction | undefined = tr.getMeta(plugin);

        switch (action?.type) {
          case "escape":
            return { ...state, disabled: true };
          case "select":
            const selectedIndex = state.selectedIndex + action.delta;
            return { ...state, selectedIndex };
        }

        const trigger = findTrigger(nextEditorState);
        const disabled = state.disabled && trigger !== null;

        return { ...state, trigger, disabled };
      },
    },
    props: {
      handleKeyDown(view, event) {
        switch (event.key) {
          case "Escape":
            view.dispatch(view.state.tr.setMeta(plugin, { type: "escape" }));
            return false;
          case "ArrowUp": /** fall through */
          case "ArrowDown":
            const { trigger, disabled } = this.getState(view.state);
            if (!trigger || disabled) return false;

            view.dispatch(
              view.state.tr.setMeta(plugin, {
                type: "select",
                delta: event.key === "ArrowUp" ? -1 : 1,
              })
            );

            return true; // prevents further propagation
          default:
            return false;
        }
      },
    },
    view() {
      const mountNode = document.createElement("div");

      return {
        update(view) {
          const { trigger, disabled, selectedIndex } = plugin.getState(
            view.state
          );

          if (!trigger || disabled) return this.destroy!();

          const coords = view.coordsAtPos(trigger.from);

          const style: CSSProperties = {
            position: "absolute",
            top: coords.bottom + document.documentElement.scrollTop,
            left: coords.left + document.documentElement.scrollLeft,
          };

          const jsx = (
            <div style={style}>
              <BlockSuggester selectedIndex={selectedIndex} />
            </div>
          );

          ensureMounted(mountNode, document.body);
          replacePortal(mountNode, mountNode, jsx);
        },
        destroy() {
          replacePortal(mountNode, null, null);
          mountNode.remove();
        },
      };
    },
  });

  return plugin;
};
