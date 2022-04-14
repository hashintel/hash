import type { BlockVariant } from "blockprotocol";
import {
  blockComponentRequiresText,
  BlockMeta,
} from "@hashintel/hash-shared/blockMeta";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { Schema } from "prosemirror-model";
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
} from "prosemirror-state";
import React, { CSSProperties } from "react";
import { RenderPortal } from "../usePortals";
import { ensureMounted } from "../../../lib/dom";
import { BlockSuggester } from "./BlockSuggester";
import { MentionSuggester } from "./MentionSuggester";

interface Trigger {
  char: "@" | "/";
  /** matched search string including its leading trigger-char */
  search: string;
  /** starting prosemirror document position */
  from: number;
  /** ending prosemirror document position */
  to: number;
}

/**
 * used to find a string triggering the suggester plugin
 */
const findTrigger = (state: EditorState<Schema>): Trigger | null => {
  // Only empty TextSelection has a $cursor
  const cursor = (state.selection as TextSelection).$cursor;
  if (!cursor) return null;

  // the cursor's parent is the node that contains it
  const text = cursor.parent.textContent;

  // the cursor's position inside its parent
  const cursorPos = cursor.parentOffset;

  // the parent's position relative to the document root
  const parentPos = cursor.pos - cursorPos;

  const match = /(@|\/)\S*$/.exec(text.substring(0, cursorPos));
  if (!match) return null;

  const from = match.index;

  // match upto the first whitespace character or the end of the node
  const to = cursorPos + text.substring(cursorPos).search(/\s|$/g);

  return {
    search: text.substring(from, to),
    from: parentPos + from,
    to: parentPos + to,
    char: match[1] as Trigger["char"],
  };
};

type SuggesterAction = { type: "escape" };

interface SuggesterState {
  /** whether or not the suggester is disabled */
  disabled: boolean;
  /** the suggester's current trigger */
  trigger: Trigger | null;
  /** whether or not the suggester is currently open */
  isOpen(): boolean;
}

/**
 * used to tag the suggester plugin/make it a singleton
 * @see https://prosemirror.net/docs/ref/#state.PluginKey
 */
const key = new PluginKey<SuggesterState, Schema>("suggester");

/**
 * Suggester plugin factory
 *
 * Behaviour:
 * Typing one of the trigger characters followed by any number of non-whitespace characters will
 * activate the plugin and open a popup right under the "textual trigger".
 * Moving the cursor outside the trigger will close the popup. Pressing the
 * Escape-key while inside the trigger will disable the plugin until a trigger
 * is newly encountered (e.g. by leaving/deleting and reentering/retyping a
 * trigger).
 */
export const createSuggester = (
  renderPortal: RenderPortal,
  getManager: () => ProsemirrorSchemaManager,
  accountId: string,
) =>
  new Plugin<SuggesterState, Schema>({
    key,
    state: {
      init() {
        return {
          trigger: null,
          disabled: false,
          isOpen() {
            return this.trigger !== null && !this.disabled;
          },
        };
      },
      /** produces a new state from the old state and incoming transactions (cf. reducer) */
      apply(tr, state, _prevEditorState, nextEditorState) {
        const action: SuggesterAction | undefined = tr.getMeta(key);

        switch (action?.type) {
          case "escape":
            return { ...state, disabled: true };
        }

        const trigger = findTrigger(nextEditorState);
        const disabled = state.disabled && trigger !== null;

        return { ...state, trigger, disabled };
      },
    },
    props: {
      /** cannot use EditorProps.handleKeyDown because it doesn't capture all keys (notably Enter) */
      handleDOMEvents: {
        keydown(view, event) {
          switch (event.key) {
            // stop prosemirror from handling these keyboard events while the suggester handles them
            case "Enter":
            case "ArrowUp":
            case "ArrowDown":
              return this.getState(view.state).isOpen();
            case "Escape":
              view.dispatch(view.state.tr.setMeta(key, { type: "escape" }));
              return false;
            default:
              return false;
          }
        },
      },
    },
    view() {
      const mountNode = document.createElement("div");

      return {
        update(view) {
          const state = key.getState(view.state)!;

          if (!state.isOpen()) return this.destroy!();

          const { from, to, search, char: triggerChar } = state.trigger!;
          const coords = view.coordsAtPos(from);

          const style: CSSProperties = {
            position: "absolute",
            top: coords.bottom + document.documentElement.scrollTop,
            left: coords.left + document.documentElement.scrollLeft,
          };

          /**
           * @todo actually create and insert an instance of the selected block
           *   type variant
           */
          const onBlockSuggesterChange = (
            variant: BlockVariant,
            blockMeta: BlockMeta["componentMetadata"],
          ) => {
            getManager()
              .createRemoteBlockTr(blockMeta.componentId, null, variant)
              .then(([tr, node, meta]) => {
                const $end = view.state.doc.resolve(to);
                const endPosition = $end.end(1);
                tr.insert(endPosition, node);

                if (blockComponentRequiresText(meta.componentSchema)) {
                  tr.setSelection(
                    TextSelection.create<Schema>(tr.doc, endPosition),
                  );
                }
                tr.replaceWith(from, to, []);

                view.dispatch(tr);
              })
              .catch((err) => {
                // eslint-disable-next-line no-console -- TODO: consider using logger
                console.error(err);
              });
          };

          const onMentionChange = (entityId: string, mentionType: string) => {
            const { tr } = view.state;

            const mentionNode = view.state.schema.nodes.mention!.create({
              mentionType,
              entityId,
            });

            tr.replaceWith(from, to, mentionNode);

            view.dispatch(tr);
          };

          let jsx: JSX.Element | null = null;

          switch (triggerChar) {
            case "/":
              jsx = (
                <BlockSuggester
                  search={search.substring(1)}
                  onChange={onBlockSuggesterChange}
                />
              );
              break;
            case "@":
              jsx = (
                <MentionSuggester
                  search={search.substring(1)}
                  onChange={onMentionChange}
                  accountId={accountId}
                />
              );
          }

          if (jsx) {
            ensureMounted(mountNode, document.body);
            renderPortal(<div style={style}>{jsx}</div>, mountNode);
          }
        },
        destroy() {
          renderPortal(null, mountNode);
          mountNode.remove();
        },
      };
    },
  }) as Plugin<unknown, Schema>;
