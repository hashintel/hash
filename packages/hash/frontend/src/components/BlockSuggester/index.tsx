import type { BlockVariant } from "@hashintel/block-protocol";
import type { ReplacePortals } from "@hashintel/hash-shared/sharedWithBackend";
import { ResolvedPos } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import React, { CSSProperties, useContext, VoidFunctionComponent } from "react";
import { tw } from "twind";
import { BlockMetaContext } from "../../blocks/blockMeta";
import { ensureMounted } from "../../lib/dom";

/**
 * used to present list of blocks to choose from to the user
 */
export const BlockSuggester: VoidFunctionComponent = () => {
  const blocksMeta = useContext(BlockMetaContext);

  // flatMap blocks' variants
  const options = Array.from(blocksMeta.values()).flatMap(
    (blockMeta) => blockMeta.componentMetadata.variants ?? []
  );

  // @todo implement interactivity for selection
  const selectedIndex = 0;
  const onChange = (_option: BlockVariant, _index: number) => {};

  return (
    <ul
      className={tw`absolute z-10 w-96 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md`}
    >
      {options.map(({ name, icon, description }, index) => (
        <li
          key={name}
          className={tw`flex border border-gray-100 ${
            index !== selectedIndex ? "bg-gray-50" : "bg-gray-100"
          } hover:bg-gray-100`}
          onClick={() =>
            index !== selectedIndex && onChange(options[index], index)
          }
        >
          <div className={tw`flex w-16 items-center justify-center`}>
            <img className={tw`w-6 h-6`} alt={name} src={icon} />
          </div>
          <div className={tw`py-3`}>
            <p className={tw`text-sm font-bold`}>{name}</p>
            <p className={tw`text-xs text-opacity-60 text-black`}>
              {description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};

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
  /** whether or not the popup is opened */
  open: boolean;
  /** the suggester's current trigger */
  trigger: Trigger | null;
}

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
        return { open: false, trigger: null, disabled: false };
      },
      apply(tr, state, _prevEitorState, nextEditorState) {
        const action = tr.getMeta(plugin);

        if (action?.type === "escape") {
          return { ...state, open: false, disabled: true };
        }

        const trigger = findTrigger(nextEditorState);
        const disabled = state.disabled && trigger !== null;
        const open = !disabled && trigger !== null;

        return { open, trigger, disabled };
      },
    },
    props: {
      handleKeyDown(view, event) {
        switch (event.key) {
          case "Escape":
            view.dispatch(view.state.tr.setMeta(plugin, { type: "escape" }));
        }

        return false;
      },
    },
    view() {
      const mountNode = document.createElement("div");

      return {
        update(view) {
          const { open, trigger } = plugin.getState(view.state);

          if (!open) return this.destroy!();

          const coords = view.coordsAtPos(trigger!.from);

          const style: CSSProperties = {
            position: "absolute",
            top: coords.bottom + document.documentElement.scrollTop,
            left: coords.left + document.documentElement.scrollLeft,
          };

          const jsx = (
            <div style={style}>
              <BlockSuggester />
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
