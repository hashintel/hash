import React, { CSSProperties, useContext, VoidFunctionComponent } from "react";
import { tw } from "twind";
import { Plugin } from "prosemirror-state";
import { inputRules, InputRule } from "prosemirror-inputrules";
import { BlockMetaContext } from "../../blocks/blockMeta";
import type { BlockVariant } from "@hashintel/block-protocol";

/** used to retrieve the last character */
const last = (str: string) => str.charAt(str.length - 1);

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

/**
 * prosemirror plugin factory for the block suggester
 */
export const createBlockSuggesterPlugin = (replacePortal: FixMeLater) => {
  const mountNode = document.body;

  const suggesterPlugin = new Plugin({
    state: {
      init() {
        return { type: "close", search: null, position: null };
      },
      apply(tr, state) {
        const nextState = tr.getMeta(this);
        return nextState || state;
      },
    },
    props: {
      handleKeyDown(view, event) {
        switch (event.key) {
          case "Escape":
            view.dispatch(
              view.state.tr.setMeta(suggesterPlugin, { type: "close" })
            );
        }

        return false; // preserve default behaviour
      },
    },
    view() {
      return {
        update(view) {
          const pluginState = suggesterPlugin.getState(view.state);

          if (pluginState.type === "close") return this.destroy!();

          const coords = view.coordsAtPos(pluginState.position);

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

  const slashMatchRule = new InputRule(
    /(?:^|\s)\/(\S*)(\s?)/g,
    (state, [match, search, whitespace], position) => {
      // reproduce the standard behaviour
      const tr = state.tr.insertText(last(match)).scrollIntoView();

      // additionally dispatch an action to our suggester plugin
      const action = whitespace
        ? { type: "close" }
        : { type: "search", search, position };

      return tr.setMeta(suggesterPlugin, action);
    }
  );

  return [suggesterPlugin, inputRules({ rules: [slashMatchRule] })];
};
