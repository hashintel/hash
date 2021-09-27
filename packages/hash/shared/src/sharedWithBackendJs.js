import { liftTarget, Mapping } from "prosemirror-transform";
import {
  fetchBlockMeta,
  defineNewBlock,
  wrapCommand,
  rewrapCommand,
} from "./sharedWithBackend";
import { EditorState, NodeSelection, Plugin } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { dropCursor } from "prosemirror-dropcursor";

/**
 * We setup two versions of the history plugin, because we occasionally
 * temporarily want to ensure that all updates made between two points are
 * absorbed into a single history item. We need a more sophisticated way of
 * manipulating history items though.
 *
 * @todo deal with this
 */
export const historyPlugin = history();
export const infiniteGroupHistoryPlugin = history({ newGroupDelay: Infinity });

/** @deprecated duplicates react context "blockMeta" */
let AsyncBlockCache = new Map();
let AsyncBlockCacheView = null;

/**
 * Defining a new type of block in prosemirror. Designed to be cached so
 * doesn't need to request the block multiple times
 *
 * @todo support taking a signal
 */
export const defineRemoteBlock = async (schema, viewConfig, componentId) => {
  /**
   * Clear the cache if the cache was setup on a different prosemirror view.
   * Probably won't happen but with fast refresh and global variables, got to
   * be sure
   */
  if (viewConfig?.view) {
    if (AsyncBlockCacheView && AsyncBlockCacheView !== viewConfig.view) {
      AsyncBlockCache = new Map();
    }
    AsyncBlockCacheView = viewConfig.view;
  }

  // If the block has not already been defined, we need to fetch the metadata & define it
  if (!componentId || !schema.nodes[componentId]) {
    if (!AsyncBlockCache.has(componentId)) {
      const promise = fetchBlockMeta(componentId)
        .then(({ componentMetadata, componentSchema }) => {
          if (!componentId || !schema.nodes[componentId]) {
            defineNewBlock(
              schema,
              componentMetadata,
              componentSchema,
              viewConfig,
              componentId
            );
          }
        })
        .catch((err) => {
          // We don't want failed requests to prevent future requests to the block being successful
          if (AsyncBlockCache.get(componentId) === promise) {
            AsyncBlockCache.delete(componentId);
          }

          console.error("bang", err);
          throw err;
        });

      AsyncBlockCache.set(componentId, promise);
    }

    /**
     * Wait for the cached request to finish (and therefore the block to have
     * been defined). In theory we'd want a retry mechanism here
     */
    await AsyncBlockCache.get(componentId);
  }
};

/**
 * Creating a new type of block in prosemirror, without necessarily having
 * requested the block metadata yet.
 *
 * @todo support taking a signal
 */
export const createRemoteBlock = async (
  schema,
  viewConfig,
  componentId,
  attrs,
  children,
  marks
) => {
  await defineRemoteBlock(schema, viewConfig, componentId);

  // Create a new instance of the newly defined prosemirror node
  return schema.nodes[componentId].create(attrs, children, marks);
};

const plugins = [
  historyPlugin,
  keymap({ "Mod-z": chainCommands(undo, undoInputRule), "Mod-y": redo }),
  keymap({
    /**
     * Wrap all of the default keymap shortcuts to ensure that the block
     * nodeviews are unwrapped before prosemirror logic is applied (the block
     * nodeview wrappers interfere with this logic)
     */
    ...Object.fromEntries(
      Object.entries(baseKeymap).map(([name, command]) => [
        name,
        wrapCommand(command),
      ])
    ),
    // @todo better way of working out that this command doesn't need wrapping
    "Mod-a": baseKeymap["Mod-a"],
  }),
  // This enables an indicator to appear when drag and dropping blocks
  dropCursor(),
  /**
   * This plugin ensures at the end of every transaction all necessary nodes
   * are wrapped with block nodeviews
   */
  new Plugin({
    appendTransaction(transactions, __, newState) {
      if (!transactions.some((tr) => tr.getMeta("commandWrapped"))) {
        let tr;

        rewrapCommand()(newState, (dispatchedTr) => {
          tr = dispatchedTr;
        });

        return tr;
      }
    },
  }),
];

export const createProseMirrorState = (
  doc,
  replacePortal,
  additionalPlugins
) => {
  const formatKeymap = keymap({
    "Mod-b": toggleMark(doc.type.schema.marks.strong),
    "Mod-i": toggleMark(doc.type.schema.marks.em),
    "Ctrl-u": toggleMark(doc.type.schema.marks.underlined),
  });

  return EditorState.create({
    doc: doc,
    plugins: [...plugins, formatKeymap, ...additionalPlugins],
  });
};
