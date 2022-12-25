import { HashBlock } from "@hashintel/hash-shared/blocks";
import {
  BlockEntity,
  getBlockChildEntity,
  isTextEntity,
} from "@hashintel/hash-shared/entity";
import {
  DraftEntity,
  EntityStore,
  isDraftBlockEntity,
} from "@hashintel/hash-shared/entity-store";
import {
  addEntityStoreAction,
  entityStorePluginState,
  subscribeToEntityStore,
} from "@hashintel/hash-shared/entity-store-plugin";
import {
  componentNodeToId,
  isComponentNode,
  isParagraphNode,
} from "@hashintel/hash-shared/prosemirror";
import { ProsemirrorManager } from "@hashintel/hash-shared/prosemirror-manager";
import { textBlockNodeToEntityProperties } from "@hashintel/hash-shared/text";
import * as Sentry from "@sentry/nextjs";
import { Node } from "prosemirror-model";
import { TextSelection, Transaction } from "prosemirror-state";
import { EditorView, NodeView } from "prosemirror-view";

import { BlockLoader } from "../../components/block-loader/block-loader";
import { ErrorBlock } from "../../components/error-block/error-block";
import { BlockContext } from "./block-context";
import { RenderPortal } from "./block-portals";
import {
  SuggesterAction,
  suggesterPluginKey,
} from "./create-suggester/create-suggester";

/**
 * Allows us to have a stable reference for properties where we do not yet
 * have a saved entity
 */
const BLANK_PROPERTIES = {};

const getChildEntity = (
  entity: DraftEntity | null | undefined,
): DraftEntity<BlockEntity["blockChildEntity"]> | null => {
  if (entity && entity.blockChildEntity) {
    if (!isDraftBlockEntity(entity)) {
      throw new Error("Cannot prepare non-block entity for prosemirrior");
    }

    return entity.blockChildEntity as DraftEntity;
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
 *    The node type name is the id of the block component (i.e. its URI).
 */
export class ComponentView implements NodeView {
  public readonly dom = document.createElement("div");
  public readonly contentDOM = document.createElement("div");

  private readonly target = createComponentViewTarget();

  private readonly unsubscribe: Function;

  private store: EntityStore;

  private wasSuggested = false;

  constructor(
    private node: Node,
    private readonly editorView: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly renderPortal: RenderPortal,
    private readonly block: HashBlock,
    private readonly manager: ProsemirrorManager,
  ) {
    this.dom.setAttribute("data-dom", "true");
    this.contentDOM.setAttribute("data-contentDOM", "true");
    this.contentDOM.style.display = "none";
    this.dom.appendChild(this.contentDOM);
    this.dom.appendChild(this.target);

    this.dom.contentEditable = "false";

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
     * node to see if it is compatible with your `NdoeView`, so that it can be
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
      const entityId = entity.metadata.editionId.baseId ?? "";

      /** used by collaborative editing feature `FocusTracker` */
      this.target.setAttribute("data-entity-id", entityId);

      const childEntity = getChildEntity(entity);

      const beforeCapture = (scope: Sentry.Scope) => {
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
              <BlockLoader
                key={entityId} // reset the component state when the entity changes, e.g. to reset the data map state
                blockEntityId={entityId}
                blockMetadata={this.block.meta}
                blockSchema={this.block.schema}
                // @todo uncomment this when sandbox is fixed
                // shouldSandbox={!this.editable}
                editableRef={this.editableRef}
                // @todo these asserted non-null fields do not definitely exist when the block is first loaded
                entityId={childEntity?.metadata.editionId.baseId!}
                entityTypeId={childEntity?.metadata.entityTypeId!}
                entityProperties={
                  childEntity && "properties" in childEntity
                    ? childEntity.properties
                    : BLANK_PROPERTIES
                }
                onBlockLoaded={this.onBlockLoaded}
              />
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

    const shouldFocusOnLoad = isParagraph && isTheOnlyChild && isEmpty;

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

      if (!isTextEntity(childEntity)) {
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
