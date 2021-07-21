import React, { useLayoutEffect, useRef, VoidFunctionComponent } from "react";
import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { defineNewBlock, defineRemoteBlock, renderPM } from "./sandbox";
import {
  Block,
  BlockMeta,
  blockPaths,
  BlockWithoutMeta,
  componentUrlToProsemirrorId,
} from "./tsUtils";
import { useBlockProtocolUpdate } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { BlockProtocolUpdatePayload } from "../../types/blockProtocol";
import { useBlockProtocolInsertIntoPage } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolInsertIntoPage";
import { usePortals } from "./usePortals";
import { useDeferredCallback } from "./useDeferredCallback";
import { schema } from "./schema";

const invertedBlockPaths = Object.fromEntries(
  Object.entries(blockPaths).map(([key, value]) => [value, key])
);

type PageBlockProps = {
  contents: (Block | BlockWithoutMeta)[];
  blocksMeta: Map<string, BlockMeta>;
  pageId: string;
  accountId: string;
};

/**
 * The naming of this as a "Block" is… interesting, considering it doesn't really work like a Block. It would be cool
 * to somehow detach the process of rendering child blocks from this and have a renderer, but it seems tricky to do that
 */
export const PageBlock: VoidFunctionComponent<PageBlockProps> = ({
  contents,
  blocksMeta,
  pageId,
  accountId,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const { insert } = useBlockProtocolInsertIntoPage();
  const { update } = useBlockProtocolUpdate();

  const [portals, replacePortal] = usePortals();
  const [deferCallback, clearCallback] = useDeferredCallback();

  const prosemirrorSetup =
    useRef<null | { view: EditorView; schema: Schema }>(null);

  const currentContents = useRef(contents);
  useLayoutEffect(() => {
    currentContents.current = contents;
  });

  /**
   * This effect runs once and just sets up the prosemirror instance. It is not responsible for setting the contents of
   * the prosemirror document
   */
  useLayoutEffect(() => {
    const node = root.current!;

    /**
     * Setting this function to global state as a shortcut to call it from deep within prosemirror.
     *
     * @todo come up with a better solution for this
     *
     * Note that this save handler only handles saving for things that prosemirror controls – i.e, the contents of
     * prosemirror text nodes / the order of / the creation of / ther deletion of blocks (noting that changing block
     * type is a deletion & a creation at once). Saves can be handled directly by the blocks implementation using the
     * update callbacks
     */
    (window as any).triggerSave = () => {
      /**
       * In order to save, we first need to map the current prosemirror document back to something that looks more like
       * the contents we were passed
       */
      const contents = currentContents.current;

      const blocks = view.state
        .toJSON()
        .doc.content.filter((block: any) => block.type === "block")
        .flatMap((block: any) => block.content) as any[];

      const mappedBlocks = blocks.map((node: any, position) => {
        const nodeType = view.state.schema.nodes[node.type];
        const meta = nodeType.defaultAttrs.meta;

        const componentId = invertedBlockPaths[meta.url] ?? meta.url;

        let entity;
        if (schema.nodes[node.type].isTextblock) {
          entity = {
            type: "Text",
            id: node.attrs.childEntityId,
            accountId: node.attrs.childEntityAccountId,
            properties: {
              texts:
                node.content
                  ?.filter((child: any) => child.type === "text")
                  .map((child: any) => ({
                    text: child.text,
                    bold:
                      child.marks?.some(
                        (mark: any) => mark.type === "strong"
                      ) ?? false,
                    italics:
                      child.marks?.some((mark: any) => mark.type === "em") ??
                      false,
                    underline:
                      child.marks?.some(
                        (mark: any) => mark.type === "underlined"
                      ) ?? false,
                  })) ?? [],
            },
          };
        } else {
          const { childEntityId, childEntityAccountId, ...props } = node.attrs;
          entity = {
            type: "UnknownEntity",
            id: childEntityId,
            accountId: childEntityAccountId,
            properties: props,
          };
        }

        return {
          entityId: node.attrs.entityId,
          accountId: node.attrs.accountId ?? accountId,
          type: "Block",
          position,
          properties: {
            componentId,
            entity,
          },
        };
      });

      /**
       * Once we have a list of blocks, we need to divide the list of blocks into new ones and
       * updated ones, as they require different queries to handle
       */
      const existingBlockIds = contents.map((block) => block.entityId);
      const newBlocks = mappedBlocks.filter(
        (block) => !existingBlockIds.includes(block.entityId)
      );

      const existingBlocks = mappedBlocks.filter((block) =>
        existingBlockIds.includes(block.entityId)
      );

      const seenEntityIds = new Set<string>();

      /**
       * An updated block also contains an updated entity, so we need to create a list of
       * entities that we need to post updates to via GraphQL
       */
      const updatedEntities = existingBlocks.flatMap((node) => {
        const block = {
          type: "Block",
          id: node.entityId,
          accountId: node.accountId,
          properties: {
            componentId: node.properties.componentId,
            entityType: node.properties.entity.type,
            entityId: node.properties.entity.id,
            accountId: node.properties.entity.accountId,
          },
        };

        const contentNode = contents.find(
          (existingBlock) => existingBlock.entityId === block.id
        );

        const blocks = [];

        if (block.properties.componentId !== contentNode?.componentId) {
          blocks.push(block);
        }

        if (node.properties.entity.type === "Text") {
          if (
            !contentNode ||
            contentNode.entity.childEntityId !== node.properties.entity.id ||
            node.properties.entity.properties.texts.length !==
              contentNode.entity.children.length ||
            (node.properties.entity.properties.texts as any[]).some(
              (text: any, idx: number) => {
                const contentText = contentNode.entity.children[idx];

                /**
                 * Really crude way of working out if any properties we care about have changed – we need a better way
                 * of working out which text entities need an update
                 */
                return (
                  !contentText ||
                  text.text !== contentText.text ||
                  text.bold !== contentText.marks?.includes("strong") ||
                  text.underline !==
                    contentText.marks?.includes("underlined") ||
                  text.italics !== contentText.marks?.includes("em")
                );
              }
            )
          ) {
            blocks.push(node.properties.entity);
          }
        }

        /**
         * Currently when the same block exists on the page in multiple locations, we prioritise the content of the
         * first one that has changed when it comes to working out if an un update is required. We need a better way of
         * handling this (i.e, take the *last* one that changed, and also more immediately sync updates between changed
         * blocks to prevent work being lost)
         *
         * @todo improve this
         */
        return blocks.filter((block) => {
          if (seenEntityIds.has(block.id)) {
            return false;
          }

          seenEntityIds.add(block.id);

          return true;
        });
      });

      /**
       * This is a real crude way of working out if order of blocks (or if blocks have been added/removed) have changed
       * within a page, in order to work out if an update operation is needed on this list
       *
       * @todo come up with something better
       */
      const blockIdsChange =
        JSON.stringify(contents.map((content) => content.entityId)) !==
        JSON.stringify(mappedBlocks.map((block) => block.entityId));

      /**
       * Building a promise here that updates the page block with the list of block ids it contains (if necessary, i.e,
       * when you delete or re-order blocks, and then calls insert for each new block, before updating blocks that need
       * to be updated. Ideally we would handle all of this in one query
       *
       * @todo improve this
       */
      newBlocks
        .reduce(
          (promise, newBlock) =>
            promise
              .catch(() => {})
              .then(() => {
                // @todo this should take the user id of whoever creates it
                insert({
                  pageId,
                  entityType: newBlock.properties.entity.type,
                  position: newBlock.position,
                  componentId: newBlock.properties.componentId,
                  entityProperties: newBlock.properties.entity.properties,
                  accountId,
                });
              }),
          blockIdsChange
            ? /**
               * There's a bug here where when we add a new block, we think we need to update the page entity but
               * that is handled by the insert block operation, so this update here is a noop
               *
               * @todo fix this
               */
              update([
                {
                  entityType: "Page",
                  entityId: pageId,
                  accountId,
                  data: {
                    contents: existingBlocks.map((node) => ({
                      entityId: node.entityId,
                      accountId: node.accountId,
                      type: "Block",
                    })),
                  },
                },
              ])
            : Promise.resolve()
        )
        .then(() =>
          update([
            /**
             * Not entirely sure what I was going for with this filter
             *
             * @todo figure this out
             */
            ...updatedEntities
              .filter(
                (entity) =>
                  (entity.properties.entityType !== "Text" ||
                    entity.properties.entityId) &&
                  entity.id
              )
              .map(
                (entity): BlockProtocolUpdatePayload<any> => ({
                  entityId: entity.id,
                  entityType: entity.type,
                  data: entity.properties,
                  accountId: entity.accountId,
                })
              ),
          ])
        );
    };

    /**
     * We want to apply saves when Prosemirror loses focus (or is triggered manually with cmd+s). However, interacting
     * with the format tooltip momentarily loses focus, so we want to wait a moment and cancel that save if focus is
     * regained quickly. The reason we only want to save when losing focus is because the process of taking the response
     * from a save and updating the prosemirror tree with new contents can mess with the cursor position.
     *
     * @todo make saves more frequent & seamless
     */
    const savePlugin = new Plugin({
      props: {
        handleDOMEvents: {
          keydown(view, evt) {
            // Manual save for cmd+s
            if (evt.key === "s" && evt.metaKey) {
              evt.preventDefault();
              (window as any).triggerSave?.();

              return true;
            }
            return false;
          },
          focus() {
            // Cancel the in-progress save
            clearCallback();
            return false;
          },
          blur: function () {
            // Trigger a cancellable save on blur
            deferCallback(() => (window as any).triggerSave());

            return false;
          },
        },
      },
    });

    /**
     * Lets see up prosemirror with an empty document, as another effect will set its contents. Unfortunately all
     * prosemirror documents have to contain at least one child, so lets insert a special "blank" placeholder child
     */
    const view = renderPM(
      node,
      schema.node("doc", {}, [schema.node("blank")]),
      { nodeViews: {} },
      replacePortal,
      [savePlugin]
    );

    prosemirrorSetup.current = { schema, view };

    return () => {
      // @todo how does this work with portals?
      node.innerHTML = "";
      prosemirrorSetup.current = null;
    };
  }, []);

  /**
   * This effect is responsible for ensuring all the preloaded blocks (currently just paragraph) are defined in
   * prosemirror
   */
  useLayoutEffect(() => {
    if (!prosemirrorSetup.current) {
      return;
    }

    const { view } = prosemirrorSetup.current;

    // @todo filter out already defined blocks
    for (const [url, meta] of Array.from(blocksMeta.entries())) {
      defineNewBlock(
        meta.componentMetadata,
        meta.componentSchema,
        view,
        componentUrlToProsemirrorId(url),
        replacePortal
      );
    }
  }, [blocksMeta]);

  /**
   * Whenever contents are updated, we want to sync them to the prosemirror document, which is an async operation as it
   * may involved defining new node types (and fetching the metadata for them). Contents change whenever we save (as we
   * replace our already loaded contents with another request for the contents, which ensures that blocks referencing
   * the same entity are all updated, and that empty IDs are properly filled (i.e, when creating a new block)
   */
  useLayoutEffect(() => {
    if (!prosemirrorSetup.current) {
      return;
    }

    const { view, schema } = prosemirrorSetup.current;

    // @todo support cancelling this
    let triggerContentUpdate = async (): Promise<void> => {
      let state = view.state;
      const { tr } = state;

      const newNodes = await Promise.all(
        contents?.map(async (block) => {
          const {
            children,
            childEntityId = null,
            childEntityAccountId = null,
            ...props
          } = block.entity;

          const id = componentUrlToProsemirrorId(block.componentId);

          return await defineRemoteBlock(
            view,
            block.componentId,
            id,
            replacePortal,
            {
              properties: props,
              entityId: block.entityId,
              accountId: block.accountId,
              childEntityId,
              childEntityAccountId,
            },
            children?.map((child: any) => {
              if (child.type === "text") {
                return schema.text(
                  child.text,
                  child.marks.map((mark: string) => schema.mark(mark))
                );
              }

              // @todo recursive nodes
              throw new Error("unrecognised child");
            }) ?? [],
            undefined
          );
        }) ?? []
      );

      /**
       * The view's state may have changed, making our current transaction invalid – so lets start again.
       *
       * @todo probably better way of dealing with this
       */
      if (view.state !== state) {
        return triggerContentUpdate();
      }

      // This creations a transaction to replace the entire content of the document
      tr.replaceWith(0, state.doc.content.size, newNodes);
      view.dispatch(tr);
    };

    triggerContentUpdate();
  }, [contents]);

  return (
    <>
      <div id="root" ref={root} />
      {portals}
    </>
  );
};
