import { liftTarget, Mapping } from "prosemirror-transform";
import { defineBlock } from "./utils";
import { Schema } from "prosemirror-model";
import { fetchBlockMeta } from "./sharedWithBackend";
import { EditorState, NodeSelection, Plugin } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { dropCursor } from "prosemirror-dropcursor";

/**
 * We setup two versions of the history plugin, because we occasionally temporarily want to ensure that all updates made
 * between two points are absorbed into a single history item. We need a more sophisticated way of manipulating history
 * items though.
 *
 * @todo deal with this
 */
export const historyPlugin = history();
export const infiniteGroupHistoryPlugin = history({ newGroupDelay: Infinity });

/**
 * This utilises getters to trick prosemirror into mutating itself in order to modify a schema with a new node type.
 * This is likely to be quite brittle, and we need to ensure this continues to work between updates to Prosemirror. We
 * could also consider asking them to make adding a new node type officially supported.
 */
export function defineNewNode(existingSchema, componentUrl, spec) {
  const existingSchemaSpec = existingSchema.spec;

  existingSchemaSpec.nodes.content.push(componentUrl, spec);

  // @todo make mark fix work properly
  new (class extends Schema {
    get nodes() {
      return existingSchema.nodes;
    }

    get marks() {
      return existingSchema.marks;
    }

    set marks(newMarks) {
      for (const [key, value] of Object.entries(newMarks)) {
        if (!this.marks[key]) {
          value.schema = existingSchema;
          this.marks[key] = value;
        }
      }
    }

    set nodes(newNodes) {
      for (const [key, value] of Object.entries(newNodes)) {
        if (!this.nodes[key]) {
          value.schema = existingSchema;
          this.nodes[key] = value;
        }
      }
    }
  })(existingSchemaSpec);
}

/**
 * This is used specifically for nodes that are special cased – i.e, paragraph.
 *
 * @todo remove this
 */
export function defineNewProsemirrorNode(
  schema,
  componentMetadata,
  componentUrl
) {
  const { domTag, ...specTemplate } = componentMetadata.spec;
  defineNewNode(
    schema,
    componentUrl,
    defineBlock(componentMetadata, {
      ...specTemplate,
      toDOM: () => [domTag, 0],
    })
  );
}

/**
 * This is used to define a new block type inside prosemiror when you have already fetched all the necessary metadata.
 * It'll define a new node type in the schema, and create a node view wrapper for you too.
 */
export function defineNewBlock(
  schema,
  componentMetadata,
  componentSchema,
  viewConfig,
  componentUrl
) {
  if (schema.nodes[componentUrl]) {
    return;
  }

  if (componentMetadata.type === "prosemirror") {
    defineNewProsemirrorNode(schema, componentMetadata, componentUrl);
  } else {
    const spec = defineBlock(componentMetadata, {
      /**
       * Currently we detect whether a block takes editable text by detecting if it has an editableRef prop in its
       * schema – we need a more sophisticated way for block authors to communicate this to us
       */
      ...(componentSchema.properties?.["editableRef"]
        ? {
            content: "text*",
            marks: "",
          }
        : {}),
    });

    defineNewNode(schema, componentUrl, spec);

    if (viewConfig) {
      const { view, replacePortal, createNodeView } = viewConfig;

      // @todo reduce duplication
      const NodeViewClass = createNodeView(
        componentUrl,
        componentSchema,
        `${componentMetadata.url}/${componentMetadata.source}`,
        replacePortal
      );

      // Add the node view definition to the view – ensures our block code is called for every instance of the block
      view.setProps({
        nodeViews: {
          ...view.nodeViews,
          [componentUrl]: (node, view, getPos, decorations) => {
            return new NodeViewClass(node, view, getPos, decorations);
          },
        },
      });
    }
  }
}

/** @deprecated duplicates react context "blockMeta" */
let AsyncBlockCache = new Map();
let AsyncBlockCacheView = null;

/**
 * Defining a new type of block in prosemirror. Designed to be cached so doesn't need to request the block multiple
 * times
 *
 * @todo support taking a signal
 */
export const defineRemoteBlock = async (schema, viewConfig, componentUrl) => {
  /**
   * Clear the cache if the cache was setup on a different prosemirror view. Probably won't happen but with fast
   * refresh and global variables, got to be sure
   */
  if (viewConfig?.view) {
    if (AsyncBlockCacheView && AsyncBlockCacheView !== viewConfig.view) {
      AsyncBlockCache = new Map();
    }
    AsyncBlockCacheView = viewConfig.view;
  }

  // If the block has not already been defined, we need to fetch the metadata & define it
  if (!componentUrl || !schema.nodes[componentUrl]) {
    if (!AsyncBlockCache.has(componentUrl)) {
      const promise = fetchBlockMeta(componentUrl)
        .then(({ componentMetadata, componentSchema }) => {
          if (!componentUrl || !schema.nodes[componentUrl]) {
            defineNewBlock(
              schema,
              componentMetadata,
              componentSchema,
              viewConfig,
              componentUrl
            );
          }
        })
        .catch((err) => {
          // We don't want failed requests to prevent future requests to the block being successful
          if (AsyncBlockCache.get(componentUrl) === promise) {
            AsyncBlockCache.delete(componentUrl);
          }

          console.error("bang", err);
          throw err;
        });

      AsyncBlockCache.set(componentUrl, promise);
    }

    /**
     * Wait for the cached request to finish (and therefore the block to have been defined). In theory we'd want a retry
     * mechanism here
     */
    await AsyncBlockCache.get(componentUrl);
  }
};

/**
 * Creating a new type of block in prosemirror, without necessarily having requested the block metadata yet.
 *
 * @todo support taking a signal
 */
export const createRemoteBlock = async (
  schema,
  viewConfig,
  componentUrl,
  attrs,
  children,
  marks
) => {
  await defineRemoteBlock(schema, viewConfig, componentUrl);

  // Create a new instance of the newly defined prosemirror node
  return schema.nodes[componentUrl].create(attrs, children, marks);
};

const rewrapCommand = (blockExisted) => (newState, dispatch) => {
  const tr = newState.tr;

  const mapping = new Mapping();
  let stepCount = tr.steps.length;

  newState.doc.descendants((node, pos) => {
    if (
      node.type.name !== "block" &&
      node.type.name !== "async" &&
      node.type.name !== "blank"
    ) {
      let newSteps = tr.steps.slice(stepCount);
      stepCount = tr.steps.length;
      for (const newStep of newSteps) {
        const map = newStep.getMap();
        mapping.appendMap(map);
      }
      const $from = tr.doc.resolve(mapping.map(pos));
      const $to = tr.doc.resolve(mapping.map(pos + node.nodeSize));
      const range = $from.blockRange($to);
      const didBlockExist = blockExisted?.(pos) ?? true;
      tr.wrap(range, [{ type: newState.schema.nodes.block }]);

      newSteps = tr.steps.slice(stepCount);
      stepCount = tr.steps.length;
      for (const newStep of newSteps) {
        const map = newStep.getMap();
        mapping.appendMap(map);
      }

      if (!didBlockExist) {
        tr.setNodeMarkup(mapping.map(pos), undefined, {
          entityId: null,
          childEntityId: null,
          accountId: null,
          versionId: null,
          childEntityAccountId: null,
          childEntityTypeId: null,
          childEntityVersionId: null,
        });
      }
    }
    return false;
  });

  dispatch?.(tr);

  return true;
};
/**
 * This wraps a prosemirror command to unwrap relevant nodes out of their containing block node in order to ensure
 * prosemirror logic that expects text block nodes to be at the top level works as intended. Rewrapping after the
 * prosemirror commands are applied is not handled here, but in a plugin (to ensure that nodes being wrapped by a block
 * is an invariant that can't be accidentally breached)
 *
 * @todo ensure we remove undo item if command fails
 */
const wrapCommand = (command) => (state, dispatch, view) => {
  if (state.selection instanceof NodeSelection) {
    return command(state, dispatch, view);
  }

  const tr = state.tr;

  const blockLocations = [];

  /**
   * First we apply changes to the transaction to unwrap every block
   */
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "block") {
      return true;
    }

    if (node.firstChild.isTextblock) {
      const start = pos + 1;
      const $from = tr.doc.resolve(tr.mapping.map(start));
      const end = pos + node.nodeSize - 1;
      const $to = tr.doc.resolve(tr.mapping.map(end));
      const range = $from.blockRange($to);
      const target = liftTarget(range);
      tr.lift(range, target);

      blockLocations.push(start);
    }

    return false;
  });

  /**
   * We don't want to yet dispatch the transaction unwrapping each block, because that could create an undesirable
   * history breakpoint. However, in order to apply the desired prosemirror command, we need an instance of the current
   * state at the point of which each of the blocks have been unwrapped. To do that, we "apply" the transaction to our
   * current state, which gives us the next state without setting the current editor view to that next state. This will
   * allow us to use it to generate the desired end state.
   *
   * Additionally, we set a meta flag to ensure our plugin that ensures all nodes are wrapped by blocks doesn't get in
   * the way.
   */
  tr.setMeta("commandWrapped", true);
  const nextState = state.apply(tr);
  tr.setMeta("commandWrapped", false);

  /**
   * Now that we have a copy of the state with unwrapped blocks, we can run the desired prosemirror command. We pass a
   * custom dispatch function instead of allowing prosemirror to directly dispatch the change to the editor view so that
   * we can capture the transactions generated by prosemirror and merge them into our existing transaction. This allows
   * us to apply all the changes together in one fell swoop, ensuring we don't have awkward intermediary history
   * breakpoints
   *
   * @todo is this sufficient to merge transactions?
   */
  const retVal = command(nextState, (nextTr) => {
    for (const step of nextTr.steps) {
      tr.step(step);
    }
  });

  const mappedBlockLocations = blockLocations.map((loc) => tr.mapping.map(loc));

  tr.setMeta("commandWrapped", true);
  const nextState2 = state.apply(tr);
  tr.setMeta("commandWrapped", false);

  rewrapCommand((start) => mappedBlockLocations.includes(start))(
    nextState2,
    (nextTr) => {
      for (const step of nextTr.steps) {
        tr.step(step);
      }
    }
  );

  dispatch(tr);

  return retVal;
};

const plugins = [
  historyPlugin,
  keymap({ "Mod-z": chainCommands(undo, undoInputRule), "Mod-y": redo }),
  keymap({
    /**
     * Wrap all of the default keymap shortcuts to ensure that the block nodeviews are unwrapped before prosemirror
     * logic is applied (the block nodeview wrappers interfere with this logic)
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
   * This plugin ensures at the end of every transaction all necessary nodes are wrapped with block nodeviews
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
