import { ReactNode } from "react";
import { Schema as JSONSchema } from "jsonschema";
import { EditorState, NodeSelection } from "prosemirror-state";
import { createRemoteBlock, defineRemoteBlock } from "./sharedWithBackendJs";

// @todo move this
// @ts-ignore
// @todo allow overwriting this again
import blockPaths from "../blockPaths.sample.json";
import { BlockMetadata } from "@hashintel/block-protocol";
import { Node as ProsemirrorNode, NodeSpec, Schema } from "prosemirror-model";
import { Decoration, EditorView } from "prosemirror-view";
import { BlockEntity } from "./types";
import { liftTarget, Mapping } from "prosemirror-transform";
import { Command } from "prosemirror-commands";

export { blockPaths };

const fetch = (globalThis as any).fetch ?? require("node-fetch");

/**
 * @todo think about removing this
 */
type BlockConfig = BlockMetadata & { componentId: string };

/**
 * @deprecated
 * @todo remove this
 */
export type Block = {
  entityId: string;
  versionId: string;
  accountId: string;
  entity: Record<any, any>;
  componentId: string;
  componentMetadata: BlockConfig;
  componentSchema: JSONSchema;
};

/**
 * @deprecated
 * @todo remove this
 */
export type BlockMeta = Pick<Block, "componentMetadata" | "componentSchema">;

/**
 * The cache is designed to store promises, not resolved values, in order to
 * ensure multiple requests for the same block in rapid succession don't cause
 * multiple web requests
 *
 * @deprecated in favor of react context "blockMeta" (which is not the final
 *   solution either)
 */
const blockCache = new Map<string, Promise<BlockMeta>>();

function toBlockName(packageName: string = "Unnamed") {
  return packageName.split("/").pop()!;
}

/**
 * transform mere options into a useable block configuration
 */
function toBlockConfig(
  options: BlockMetadata,
  componentId: string
): BlockConfig {
  const defaultVariant = {
    name: toBlockName(options.name),
    description: options.description,
    icon: "/path/to/icon.svg", // @todo default icon
    properties: {},
  };

  const variants = options.variants?.map((variant) => ({
    ...defaultVariant,
    ...variant,
    /**
     * @todo: prefix path to icon w/ block's baseUrl when introducing icons to
     *   blocks
     * ```
     * icon: [url, variant.icon].join("/")
     * ```
     */
    icon: "/format-font.svg",
  })) ?? [defaultVariant];

  return { ...options, componentId, variants };
}

export const componentIdToUrl = (componentId: string) =>
  ((blockPaths as any)[componentId] ?? componentId) as string;

// @todo deal with errors, loading, abort etc.
export const fetchBlockMeta = async (
  componentId: string
): Promise<BlockMeta> => {
  const url = componentIdToUrl(componentId);

  if (blockCache.has(url)) {
    return blockCache.get(url)!;
  }

  const promise = (async () => {
    const metadata: BlockMetadata = await (
      await fetch(`${url}/metadata.json`)
    ).json();

    const schema = await (await fetch(`${url}/${metadata.schema}`)).json();

    const result: BlockMeta = {
      componentMetadata: toBlockConfig(metadata, componentId),
      componentSchema: schema,
    };

    return result;
  })();

  // @ts-ignore
  if (typeof window !== "undefined") {
    blockCache.set(url, promise);
  }

  return await promise;
};

/**
 * @deprecated
 * @todo remove this
 */
export type BlockWithoutMeta = Omit<
  Block,
  "componentMetadata" | "componentSchema"
>;

/**
 * @todo this API could possibly be simpler
 */
export type ReplacePortals = (
  existingNode: HTMLElement | null,
  nextNode: HTMLElement | null,
  reactNode: ReactNode | null
) => void;

type ViewConfig = {
  view: any;
  replacePortal: ReplacePortals;
  createNodeView: Function;
} | null;

export const ensureBlockLoaded = async (
  schema: Schema,
  blockJson: { [key: string]: any },
  viewConfig: ViewConfig
) => {
  const url = blockJson.type;

  if (!url.startsWith("http")) {
    return;
  }

  await defineRemoteBlock(schema, viewConfig, url);
};

export const ensureDocBlocksLoaded = async (
  schema: Schema,
  docJson: {
    [key: string]: any;
  },
  viewConfig: ViewConfig
) => {
  await Promise.all(
    (docJson.content as any[]).map(async (block) => {
      const content = block.type === "block" ? block.content?.[0] : block;

      await ensureBlockLoaded(schema, content, viewConfig);
    })
  );
};

export const getProseMirrorNodeAttributes = (entity: BlockEntity) => ({
  entityId: entity.metadataId,
});

/**
 * @todo replace this with a prosemirror command
 * @todo take a signal
 * @todo i think we need to put placeholders for the not-yet-fetched blocks
 *   immediately, and then have the actual blocks pop in – it being delayed too
 *   much will mess with collab
 */
export const createEntityUpdateTransaction = async (
  state: EditorState,
  entities: BlockEntity[],
  viewConfig: ViewConfig
) => {
  const schema = state.schema;

  const newNodes = await Promise.all(
    entities.map((block) =>
      // @todo pass signal through somehow
      createRemoteBlock(
        schema,
        viewConfig,
        block.properties.componentId,
        getProseMirrorNodeAttributes(block),
        mapEntityToChildren(block.properties.entity).map((child: any) => {
          if (child.type === "text") {
            return schema.text(
              child.text,
              child.marks.map((mark: string) => schema.mark(mark))
            );
          }

          // @todo recursive nodes
          throw new Error("unrecognised child");
        })
      )
    )
  );

  const { tr } = state;

  // This creations a transaction to replace the entire content of the document
  tr.replaceWith(0, state.doc.content.size, newNodes);

  return tr;
};

const mapEntityToChildren = (entity: BlockEntity["properties"]["entity"]) => {
  if (entity.__typename === "Text") {
    return entity.textProperties.texts.map((text) => ({
      type: "text",
      text: text.text,
      entityId: entity.metadataId,
      versionId: entity.id,
      accountId: entity.accountId,

      // This maps the boolean properties on the entity into an array of mark names
      marks: [
        ["strong", text.bold],
        ["underlined", text.underline],
        ["em", text.italics],
      ]
        .filter(([, include]) => include)
        .map(([mark]) => mark),
    }));
  }

  return [];
};

declare interface OrderedMapPrivateInterface<T> {
  content: (string | T)[];
}

/**
 * This utilises getters to trick prosemirror into mutating itself in order to
 * modify a schema with a new node type. This is likely to be quite brittle,
 * and we need to ensure this continues to work between updates to Prosemirror.
 * We could also consider asking them to make adding a new node type officially
 * supported.
 */
export function defineNewNode<
  N extends string = any,
  M extends string = any,
  S extends Schema = Schema<N, M>
>(existingSchema: S, componentId: string, spec: NodeSpec) {
  const existingSchemaSpec = existingSchema.spec;
  const map = existingSchemaSpec.nodes;
  const privateMap: OrderedMapPrivateInterface<NodeSpec> = map as any;

  privateMap.content.push(componentId, spec);

  new (class extends Schema {
    // @ts-ignore
    get nodes() {
      return existingSchema.nodes;
    }

    // @ts-ignore
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

export const createProsemirrorSpec = (spec: Partial<NodeSpec>): NodeSpec => ({
  ...spec,
  selectable: false,
  group: "blockItem",
  attrs: {
    ...(spec.attrs ?? {}),
    entityId: { default: "" },
  },
});

/**
 * This is used to define a new block type inside prosemiror when you have
 * already fetched all the necessary metadata. It'll define a new node type in
 * the schema, and create a node view wrapper for you too.
 */
export function defineNewBlock<
  N extends string = any,
  M extends string = any,
  S extends Schema = Schema<N, M>
>(
  schema: S,
  componentMetadata: BlockConfig,
  componentSchema: Block["componentSchema"],
  viewConfig: ViewConfig,
  componentId: string
) {
  if (schema.nodes[componentId]) {
    return;
  }

  const spec = createProsemirrorSpec({
    /**
     * Currently we detect whether a block takes editable text by detecting if
     * it has an editableRef prop in its schema – we need a more sophisticated
     * way for block authors to communicate this to us
     */
    ...(componentSchema.properties?.["editableRef"]
      ? {
          content: "text*",
          marks: "_",
        }
      : {}),
  });

  defineNewNode(schema, componentId, spec);

  if (viewConfig) {
    const { view, replacePortal, createNodeView } = viewConfig;

    // @todo type this
    const NodeViewClass = createNodeView(
      componentId,
      componentSchema,
      componentMetadata.source,
      replacePortal
    );

    // Add the node view definition to the view – ensures our block code is
    // called for every instance of the block
    view.setProps({
      nodeViews: {
        ...view.nodeViews,
        [componentId]: (
          node: ProsemirrorNode<S>,
          view: EditorView<S>,
          getPos: (() => number) | boolean,
          decorations: Decoration[]
        ) => {
          return new NodeViewClass(node, view, getPos, decorations);
        },
      },
    });
  }
}

export const rewrapCommand =
  (blockExisted?: (position: number) => boolean): Command<Schema> =>
  (newState, dispatch) => {
    const tr = newState.tr;

    const mapping = new Mapping();
    let stepCount = tr.steps.length;

    newState.doc.descendants((node, pos) => {
      if (
        // @todo need to do something smarter here
        node.type.name !== "block" &&
        node.type.name !== "async" &&
        node.type.name !== "blank" &&
        node.type.name !== "entity"
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
        if (!range) {
          throw new Error("Cannot rewrap");
        }
        const didBlockExist = blockExisted?.(pos) ?? true;
        tr.wrap(range, [
          { type: newState.schema.nodes.block },
          { type: newState.schema.nodes.entity },
        ]);

        newSteps = tr.steps.slice(stepCount);
        stepCount = tr.steps.length;
        for (const newStep of newSteps) {
          const map = newStep.getMap();
          mapping.appendMap(map);
        }

        if (!didBlockExist) {
          tr.setNodeMarkup(mapping.map(pos), undefined, {
            entityId: null,
          });
        }
      }
      return false;
    });

    dispatch?.(tr);

    return true;
  };

/**
 * This wraps a prosemirror command to unwrap relevant nodes out of their
 * containing block node in order to ensure prosemirror logic that expects text
 * block nodes to be at the top level works as intended. Rewrapping after the
 * prosemirror commands are applied is not handled here, but in a plugin (to
 * ensure that nodes being wrapped by a block is an invariant that can't be
 * accidentally breached)
 *
 * @todo ensure we remove undo item if command fails
 */
export const wrapCommand =
  (command: Command<Schema>): Command<Schema> =>
  (state, dispatch, view) => {
    // @todo maybe this doesn't work now
    if (state.selection instanceof NodeSelection) {
      return command(state, dispatch, view);
    }
    const { schema, tr } = state;

    const blockLocations: number[] = [];

    // /**
    //  * First we apply changes to the transaction to unwrap every block
    //  */
    // state.doc.descendants((node, pos) => {
    //   if (node.type.name !== "block") {
    //     return true;
    //   }
    //
    //   if (node.firstChild.isTextblock) {
    //     const start = pos + 1;
    //     const $from = tr.doc.resolve(tr.mapping.map(start));
    //     const end = pos + node.nodeSize - 1;
    //     const $to = tr.doc.resolve(tr.mapping.map(end));
    //     const range = $from.blockRange($to);
    //     const target = liftTarget(range);
    //     tr.lift(range, target);
    //
    //     blockLocations.push(start);
    //   }
    //
    //   return false;
    // });

    state.doc.descendants((node, pos) => {
      if ([schema.nodes.block, schema.nodes.entity].includes(node.type)) {
        return true;
      }

      if (node.isTextblock) {
        const $start = tr.doc.resolve(tr.mapping.map(pos));
        const $end = tr.doc.resolve(tr.mapping.map(pos + node.nodeSize));
        const range = $start.blockRange($end);

        if (!range) {
          throw new Error("Cannot unwrap");
        }

        /**
         * @todo we need to store the nodes that we're destroying, so we can
         * recreate them
         */
        tr.lift(range, 0);
      }

      return false;
    });

    /**
     * We don't want to yet dispatch the transaction unwrapping each block,
     * because that could create an undesirable history breakpoint. However, in
     * order to apply the desired prosemirror command, we need an instance of the
     * current state at the point of which each of the blocks have been
     * unwrapped. To do that, we "apply" the transaction to our current state,
     * which gives us the next state without setting the current editor view to
     * that next state. This will allow us to use it to generate the desired end
     * state.
     *
     * Additionally, we set a meta flag to ensure our plugin that ensures all
     * nodes are wrapped by blocks doesn't get in the way.
     */
    tr.setMeta("commandWrapped", true);
    const nextState = state.apply(tr);
    tr.setMeta("commandWrapped", false);

    /**
     * Now that we have a copy of the state with unwrapped blocks, we can run the
     * desired prosemirror command. We pass a custom dispatch function instead of
     * allowing prosemirror to directly dispatch the change to the editor view so
     * that we can capture the transactions generated by prosemirror and merge
     * them into our existing transaction. This allows us to apply all the
     * changes together in one fell swoop, ensuring we don't have awkward
     * intermediary history breakpoints
     *
     * @todo is this sufficient to merge transactions?
     */
    const retVal = command(nextState, (nextTr) => {
      for (const step of nextTr.steps) {
        tr.step(step);
      }
    });

    const mappedBlockLocations = blockLocations.map((loc) =>
      tr.mapping.map(loc)
    );

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

    dispatch?.(tr);

    return retVal;
  };
