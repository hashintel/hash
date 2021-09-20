import type { BlockVariant } from "@hashintel/block-protocol";
import { ResolvedPos } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import React, { CSSProperties, useContext, VoidFunctionComponent } from "react";
import { tw } from "twind";
import { BlockMetaContext } from "../../blocks/blockMeta";

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
          key={index}
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

const findTrigger = (state: EditorState) => {
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

/**
 * prosemirror plugin factory for the block suggester
 */
export const createBlockSuggesterPlugin = (replacePortal: FixMeLater) => {
  const mountNode = document.body;

  const suggesterPlugin: Plugin = new Plugin({
    state: {
      init() {
        return { open: false, trigger: null, requireChange: false };
      },
      apply(tr, state, _prevEitorState, nextEditorState) {
        const action = tr.getMeta(suggesterPlugin);

        if (action?.type === "escape") {
          return { ...state, open: false, requireChange: true };
        }

        const trigger = findTrigger(nextEditorState);

        if (trigger && state.requireChange) {
          return state.trigger?.search === trigger.search
            ? state
            : { open: true, trigger, requireChange: false };
        }

        return { ...state, open: trigger != null, trigger };
      },
    },
    props: {
      handleKeyDown(view, event) {
        switch (event.key) {
          case "Escape":
            view.dispatch(
              view.state.tr.setMeta(suggesterPlugin, { type: "escape" })
            );
        }

        return false;
      },
    },
    view() {
      return {
        update(view) {
          const pluginState = suggesterPlugin.getState(view.state);

          if (!pluginState.open) return this.destroy!();

          const coords = view.coordsAtPos(pluginState.trigger.from);

          const style: CSSProperties = {
            position: "absolute",
            top: coords.bottom,
            left: coords.left,
          };

          const jsx = (
            <div style={style}>
              <BlockSuggester />
            </div>
          );

          replacePortal(mountNode, mountNode, jsx);
        },
        destroy() {
          replacePortal(mountNode, null, null);
        },
      };
    },
  });

  return suggesterPlugin;
};
