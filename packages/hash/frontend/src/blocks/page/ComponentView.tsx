import { HashBlockMeta } from "@hashintel/hash-shared/blocks";
import {
  BlockEntity,
  getChildDraftEntityFromTextBlock,
  isTextEntity,
} from "@hashintel/hash-shared/entity";
import {
  DraftEntity,
  EntityStore,
  isDraftBlockEntity,
} from "@hashintel/hash-shared/entityStore";
import {
  addEntityStoreAction,
  entityStorePluginState,
  entityStorePluginStateFromTransaction,
  generateDraftIdForEntity,
  subscribeToEntityStore,
} from "@hashintel/hash-shared/entityStorePlugin";
import {
  componentNodeToId,
  isComponentNode,
} from "@hashintel/hash-shared/prosemirror";
import { textBlockNodeToEntityProperties } from "@hashintel/hash-shared/text";
import * as Sentry from "@sentry/nextjs";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { TextSelection, Transaction } from "prosemirror-state";
import { EditorView, NodeView } from "prosemirror-view";
import { BlockLoader } from "../../components/BlockLoader/BlockLoader";
import { ErrorBlock } from "../../components/ErrorBlock/ErrorBlock";
import { BlockContext } from "./BlockContext";
import {
  SuggesterAction,
  suggesterPluginKey,
} from "./createSuggester/createSuggester";
import { RenderPortal } from "./usePortals";

/**
 * Allows us to have a stable reference for properties where we do not yet
 * have a saved entity
 */
const BLANK_PROPERTIES = {};

const getChildEntity = (
  entity: DraftEntity | null | undefined,
): DraftEntity<BlockEntity["properties"]["entity"]> | null => {
  if (entity) {
    if (!isDraftBlockEntity(entity)) {
      throw new Error("Cannot prepare non-block entity for prosemirrior");
    }

    return entity.properties.entity;
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
export class ComponentView implements NodeView<Schema> {
  public readonly dom = document.createElement("div");
  public readonly contentDOM = document.createElement("div");

  private readonly target = createComponentViewTarget();

  private readonly unsubscribe: Function;

  private store: EntityStore;

  private wasSuggested = false;

  constructor(
    private node: ProsemirrorNode<Schema>,
    private readonly editorView: EditorView<Schema>,
    private readonly getPos: () => number,
    private readonly renderPortal: RenderPortal,
    private readonly meta: HashBlockMeta,
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

  update(node: ProsemirrorNode<Schema>) {
    this.node = node;

    if (
      isComponentNode(node) &&
      componentNodeToId(node) === this.meta.componentId
    ) {
      const entity = this.getDraftBlockEntity();

      const blockDraftId = entity?.draftId;

      // @todo handle entity id not being defined
      const entityId = entity.entityId ?? "";

      /** used by collaborative editing feature `FocusTracker` */
      this.target.setAttribute("data-entity-id", entityId);

      const childEntity = getChildEntity(entity);

      const beforeCapture = (scope: Sentry.Scope) => {
        scope.setTag("block", this.meta.componentId);
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
                blockEntityId={entityId}
                entityType={childEntity?.entityType}
                blockMetadata={this.meta}
                // @todo uncomment this when sandbox is fixed
                // shouldSandbox={!this.editable}
                editableRef={this.editableRef}
                // @todo these asserted non-null fields do not definitely exist when the block is first loaded
                accountId={childEntity?.accountId!}
                entityId={childEntity?.entityId!}
                entityTypeId={childEntity?.entityTypeId!}
                entityProperties={
                  childEntity && "properties" in childEntity
                    ? childEntity.properties
                    : BLANK_PROPERTIES
                }
                linkGroups={childEntity?.linkGroups ?? []}
                linkedEntities={childEntity?.linkedEntities ?? []}
                linkedAggregations={childEntity?.linkedAggregations ?? []}
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

  private getBlockDraftId() {
    return this.editorView.state.doc.resolve(this.getPos()).node(2).attrs
      .draftId;
  }

  private onBlockLoaded = () => {
    /**
     * After two calls to setImmediate, we know the block will have had the
     * chance to initiate an editable section and thereby become selected if
     * initiated via the suggester. If it hasn't happened in that time, we want
     * to expire the opportunity to become automatically selected.
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
  };

  private editableRef = (editableNode: HTMLElement | null) => {
    const childTextEntity = getChildDraftEntityFromTextBlock(
      this.getBlockDraftId(),
      this.store,
    );

    if (!childTextEntity) {
      throw new Error("Block not ready to become editable");
    }

    const state = this.editorView.state;
    let tr: Transaction<Schema> | null = null;

    if (!isTextEntity(childTextEntity)) {
      tr ??= state.tr;

      const newTextDraftId = generateDraftIdForEntity(null);
      addEntityStoreAction(state, tr, {
        type: "newDraftEntity",
        payload: {
          accountId: childTextEntity.accountId,
          draftId: newTextDraftId,
          entityId: null,
        },
      });

      // @todo should we use the text entity directly, or just copy the content?
      addEntityStoreAction(state, tr, {
        type: "updateEntityProperties",
        payload: {
          draftId: newTextDraftId,
          // @todo indicate the entity type?
          properties: textBlockNodeToEntityProperties(this.node),
          merge: false,
        },
      });

      addEntityStoreAction(state, tr, {
        type: "updateEntityProperties",
        payload: {
          draftId: childTextEntity.draftId,
          properties: {
            text: {
              __linkedData: {},
              data: entityStorePluginStateFromTransaction(tr, state).store
                .draft[newTextDraftId]!,
            },
          },
          merge: true,
        },
      });
    }

    if (editableNode) {
      if (!editableNode.contains(this.contentDOM)) {
        editableNode.appendChild(this.contentDOM);
        this.contentDOM.style.display = "";
      }

      this.dom.removeAttribute("contentEditable");

      if (this.wasSuggested) {
        tr ??= state.tr;
        tr.setSelection(
          TextSelection.create<Schema>(state.doc, this.getPos() + 1),
        );

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
      !this.contentDOM?.contains(event.target) &&
      event.target !== this.contentDOM;

    const targetIsContentDom = event.target === this.contentDOM;

    return event.type === "childList"
      ? targetIsOutsideContentDOM
      : targetIsOutsideContentDOM || targetIsContentDom;
  }
}
