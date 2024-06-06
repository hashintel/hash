import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { HashBlock } from "@local/hash-isomorphic-utils/blocks";
import type { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import {
  getBlockChildEntity,
  isRichTextProperties,
} from "@local/hash-isomorphic-utils/entity";
import type {
  DraftEntity,
  EntityStore,
} from "@local/hash-isomorphic-utils/entity-store";
import { isDraftBlockEntity } from "@local/hash-isomorphic-utils/entity-store";
import {
  addEntityStoreAction,
  entityStorePluginState,
  subscribeToEntityStore,
} from "@local/hash-isomorphic-utils/entity-store-plugin";
import {
  componentNodeToId,
  isComponentNode,
  isParagraphNode,
} from "@local/hash-isomorphic-utils/prosemirror";
import type { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import { textBlockNodeToEntityProperties } from "@local/hash-isomorphic-utils/text";
import * as Sentry from "@sentry/nextjs";
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";

import { BlockLoader } from "../../../components/block-loader/block-loader";
import { ErrorBlock } from "../../../components/error-block/error-block";
import { BlockCollectionContext } from "../block-collection-context";
import { BlockContext } from "./block-context";
import type { RenderPortal } from "./block-portals";
import type { SuggesterAction } from "./create-suggester/create-suggester";
import { suggesterPluginKey } from "./create-suggester/create-suggester";

const getChildEntity = (
  entity: DraftEntity | null | undefined,
): DraftEntity<BlockEntity["blockChildEntity"]> | null => {
  if (entity && entity.blockChildEntity) {
    if (!isDraftBlockEntity(entity)) {
      throw new Error("Cannot prepare non-block entity for ProseMirror");
    }

    return entity.blockChildEntity as DraftEntity<
      BlockEntity["blockChildEntity"]
    >;
  }

  return null;
};

/**
 * @sync `componentViewTargetSelector`
 * @returns a target-/mount-node for a ComponentView instance
 */
const createComponentViewTarget = () => {
  const el = document.createElement("div");
  el.setAttribute("data-target", "true");
  return el;
};

/**
 * used to match target-/mount-nodes of ComponentView instances
 * @sync `createComponentViewTarget`
 */
export const componentViewTargetSelector = "div[data-target=true]";

/**
 * This is the node view that renders the block component,
 *    and attaches an editable DOM node if the component provides for it.
 *    The node type name is the id of the block component (i.e. its URL).
 */
export class ComponentView implements NodeView {
  public readonly dom = document.createElement("div");
  public readonly contentDOM = document.createElement("div");

  private readonly target = createComponentViewTarget();

  private readonly unsubscribe: () => void;

  private store: EntityStore;

  private wasSuggested = false;

  constructor(
    private node: Node,
    private readonly editorView: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly renderPortal: RenderPortal,
    private readonly block: HashBlock,
    private readonly manager: ProsemirrorManager,
    private readonly readonly: boolean,
    private readonly autoFocus: boolean,
  ) {
    this.dom.setAttribute("data-dom", "true");
    this.contentDOM.setAttribute("data-contentDOM", "true");
    this.contentDOM.style.display = "none";
    this.dom.appendChild(this.contentDOM);
    this.dom.appendChild(this.target);

    this.dom.contentEditable = "false";

    this.autoFocus = autoFocus;

    this.store = entityStorePluginState(editorView.state).store;
    this.unsubscribe = subscribeToEntityStore(this.editorView, (store) => {
      this.store = store;
      this.update(this.node);
    });

    /**
     * If this block was inserted by the suggester, we may want to update the
     * cursor to within this block once its loaded, if it turns out to be a
     * text block, so we "remember" that the block was inserted by the suggester.
     * However, we also want to clear the suggester state as we have "claimed"
     * the suggested position, and it makes it less likely the cursor will
     * accidentally be claimed by the wrong block if something changes block
     * positions in unexpected ways.
     *
     * @note This is cleared in `onBlockLoaded` if the cursor isn't claimed in
     *       time
     */
    this.wasSuggested =
      suggesterPluginKey.getState(this.editorView.state)
        ?.suggestedBlockPosition === this.getPos();

    if (this.wasSuggested) {
      this.editorView.dispatch(
        this.editorView.state.tr.setMeta(suggesterPluginKey, {
          type: "suggestedBlock",
          payload: { position: null },
        } as SuggesterAction),
      );
    }

    this.update(this.node);
  }

  update(node: Node) {
    this.node = node;

    /**
     * Prosemirror will sometimes call `update` on your `NodeView` with a new
     * node to see if it is compatible with your `NodeView`, so that it can be
     * reused. If you return `false` from the `update` function, it will call
     * `destroy` on your `NodeView` and create a new one instead. So this means
     * in theory we could get `update` called with a component node representing
     * a different component. We need to guard against that.
     *
     * @see https://prosemirror.net/docs/ref/#view.NodeView.update
     */
    if (
      isComponentNode(node) &&
      componentNodeToId(node) === this.block.meta.componentId
    ) {
      const entity = this.getDraftBlockEntity();

      const blockDraftId = entity.draftId;

      // @todo handle entity id not being defined
      const entityId = entity.metadata.recordId.entityId ?? "";

      /** used by collaborative editing feature `FocusTracker` */
      this.target.setAttribute("data-entity-id", entityId);

      const childEntity = getChildEntity(entity);

      const beforeCapture = (scope: Sentry.Scope) => {
        scope.setTag("error-boundary", "block");
        scope.setTag("block", this.block.meta.componentId);
      };

      const onRetry = () => {
        this.renderPortal(null, this.target);
        this.update(node);
      };

      this.renderPortal(
        <BlockContext.Consumer>
          {(ctx) => (
            <Sentry.ErrorBoundary
              beforeCapture={beforeCapture}
              fallback={(props) => (
                <ErrorBlock
                  {...props}
                  onRetry={() => {
                    ctx?.setError(false);
                    onRetry();
                  }}
                />
              )}
              onError={() => {
                ctx?.setError(true);
              }}
            >
              <BlockCollectionContext.Consumer>
                {(collectionContext) => (
                  <BlockLoader
                    blockCollectionSubgraph={
                      collectionContext?.blockCollectionSubgraph
                    }
                    blockEntityId={
                      childEntity?.metadata.recordId.entityId as
                        | EntityId
                        | undefined
                    } // @todo make this always defined
                    blockEntityTypeId={this.block.meta.schema as VersionedUrl}
                    blockMetadata={this.block.meta}
                    entityStore={this.store}
                    // @todo uncomment this when sandbox is fixed
                    // shouldSandbox={!this.editable}
                    editableRef={this.editableRef}
                    fallbackBlockProperties={childEntity?.properties}
                    wrappingEntityId={entityId}
                    onBlockLoaded={this.onBlockLoaded}
                    readonly={this.readonly}
                    userPermissionsOnEntities={
                      collectionContext?.userPermissionsOnEntities
                    }
                  />
                )}
              </BlockCollectionContext.Consumer>
            </Sentry.ErrorBoundary>
          )}
        </BlockContext.Consumer>,
        this.target,
        blockDraftId,
      );

      return true;
    } else {
      return false;
    }
  }

  private getDraftBlockEntity() {
    const draftId = this.getBlockDraftId();
    const entity = this.store.draft[draftId];

    if (!entity || !isDraftBlockEntity(entity)) {
      throw new Error("Component view can't find block entity");
    }

    return entity;
  }

  private isNodeInDoc() {
    return typeof this.getPos() === "number";
  }

  private mustGetPos() {
    if (!this.isNodeInDoc()) {
      throw new Error("Component has been removed from doc");
    }

    return this.getPos()!;
  }

  private getBlockDraftId() {
    return this.editorView.state.doc.resolve(this.mustGetPos()).node(2).attrs
      .draftId;
  }

  private onBlockLoaded = () => {
    /**
     * After two calls to setImmediate, we know the block will have had the
     * chance to initiate an editable section and thereby claim the cursor if
     * inserted via the suggester. If it hasn't happened in that time, we want
     * to expire the opportunity to claim the cursor.
     *
     * @todo find a better way of knowing there's been the opportunity for
     *       this which doesn't depend on timing
     */
    if (this.wasSuggested) {
      setImmediate(() =>
        setImmediate(() => {
          this.wasSuggested = false;
        }),
      );
    }

    const isParagraph = isParagraphNode(this.node);

    const isTheOnlyChild = this.editorView.state.doc.childCount === 1;
    const isEmpty = this.node.content.size === 0;

    const shouldFocusOnLoad =
      isParagraph && isTheOnlyChild && isEmpty && this.autoFocus;

    if (shouldFocusOnLoad) {
      this.editorView.focus();
    }
  };

  private editableRef = (editableNode: HTMLElement | null) => {
    const state = this.editorView.state;
    let tr: Transaction | null = null;

    if (editableNode && this.isNodeInDoc()) {
      const childEntity = getBlockChildEntity(
        this.getBlockDraftId(),
        this.store,
      );

      if (!childEntity || !isComponentNode(this.node)) {
        throw new Error("Block not ready to become editable");
      }

      if (!isRichTextProperties(childEntity.properties)) {
        tr ??= state.tr;

        addEntityStoreAction(state, tr, {
          type: "updateEntityProperties",
          payload: {
            draftId: childEntity.draftId,
            merge: true,
            properties: textBlockNodeToEntityProperties(this.node),
          },
        });
      }

      if (!editableNode.contains(this.contentDOM)) {
        editableNode.appendChild(this.contentDOM);
        this.contentDOM.style.display = "";
      }

      this.dom.removeAttribute("contentEditable");

      if (this.wasSuggested) {
        tr ??= state.tr;
        tr.setSelection(TextSelection.create(state.doc, this.mustGetPos() + 1));

        this.wasSuggested = false;
      }
    } else {
      this.destroyEditableRef();
    }

    if (tr) {
      this.editorView.dispatch(tr);
    }
  };

  private destroyEditableRef() {
    this.dom.contentEditable = "false";
    this.contentDOM.style.display = "none";
    this.dom.appendChild(this.contentDOM);
  }

  destroy() {
    this.destroyEditableRef();
    this.unsubscribe();
  }

  stopEvent(event: Event) {
    if (event.type === "dragstart") {
      event.preventDefault();
    }

    return this.dom.contentEditable === "false";
  }

  // This condition is designed to check that the event isn’t coming from React-handled code.
  // Not doing so leads to cycles of mutation records.
  ignoreMutation(
    event:
      | MutationRecord
      | {
          type: "selection";
          target: Element;
        },
  ) {
    // We still want ProseMirror to know about all selection events to track cursor moves
    if (event.type === "selection") {
      return false;
    }

    const targetIsOutsideContentDOM =
      !this.contentDOM.contains(event.target) &&
      event.target !== this.contentDOM;

    const targetIsContentDom = event.target === this.contentDOM;

    return event.type === "childList"
      ? targetIsOutsideContentDOM
      : targetIsOutsideContentDOM || targetIsContentDom;
  }
}
