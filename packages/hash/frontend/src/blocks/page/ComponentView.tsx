import { BlockConfig } from "@hashintel/hash-shared/blockMeta";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import {
  DraftEntity,
  EntityStore,
  isDraftBlockEntity,
} from "@hashintel/hash-shared/entityStore";
import {
  entityStorePluginState,
  subscribeToEntityStore,
} from "@hashintel/hash-shared/entityStorePlugin";
import {
  componentNodeToId,
  isComponentNode,
} from "@hashintel/hash-shared/prosemirror";
import * as Sentry from "@sentry/nextjs";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import { EditorView, NodeView } from "prosemirror-view";
import { BlockLoader } from "../../components/BlockLoader/BlockLoader";
import { ErrorBlock } from "../../components/ErrorBlock/ErrorBlock";
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

  private readonly sourceName: string;

  private readonly unsubscribe: Function;

  private editable = false;
  private store: EntityStore;

  constructor(
    private node: ProsemirrorNode<Schema>,
    private readonly editorView: EditorView<Schema>,
    private readonly getPos: () => number,
    private readonly renderPortal: RenderPortal,
    private readonly config: BlockConfig,
  ) {
    if (!config.source) {
      throw new Error("Cannot create new block for component missing a source");
    }

    this.sourceName = config.source;

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

    this.update(this.node);
  }

  update(node: ProsemirrorNode<Schema>) {
    this.node = node;

    if (
      isComponentNode(node) &&
      componentNodeToId(node) === this.config.componentId
    ) {
      const blockDraftId: string = this.editorView.state.doc
        .resolve(this.getPos())
        .node(2).attrs.draftId;

      const entity = this.store.draft[blockDraftId]!;

      // @todo handle entity id not being defined
      const entityId = entity.entityId ?? "";

      /** used by collaborative editing feature `FocusTracker` */
      this.target.setAttribute("data-entity-id", entityId);

      const childEntity = getChildEntity(entity);

      const beforeCapture = (scope: Sentry.Scope) => {
        scope.setTag("block", this.config.componentId);
      };

      const onRetry = () => {
        this.renderPortal(null, this.target);
        this.update(node);
      };

      this.renderPortal(
        <Sentry.ErrorBoundary
          beforeCapture={beforeCapture}
          fallback={(props) => <ErrorBlock {...props} onRetry={onRetry} />}
        >
          <BlockLoader
            blockEntityId={entityId}
            entityType={childEntity?.entityType}
            blockMetadata={this.config}
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
          />
        </Sentry.ErrorBoundary>,
        this.target,
      );

      return true;
    } else {
      return false;
    }
  }

  editableRef = (editableNode: HTMLElement | null) => {
    const nodeSelected =
      suggesterPluginKey.getState(this.editorView.state)
        ?.autoselectingPosition === this.getPos();

    const tr = this.editorView.state.tr.setMeta(suggesterPluginKey, {
      type: "autoselect",
      payload: { position: null },
    } as SuggesterAction);

    if (editableNode) {
      if (!editableNode.contains(this.contentDOM)) {
        editableNode.appendChild(this.contentDOM);
        this.contentDOM.style.display = "";
      }

      this.dom.removeAttribute("contentEditable");
      this.editable = true;

      tr.setSelection(TextSelection.create<Schema>(tr.doc, this.getPos()));
    } else {
      this.destroyEditableRef();
    }

    if (nodeSelected) {
      this.editorView.dispatch(tr);
    }
  };

  private destroyEditableRef() {
    this.dom.contentEditable = "false";
    this.contentDOM.style.display = "none";
    this.dom.appendChild(this.contentDOM);
    this.editable = false;
  }

  destroy() {
    this.destroyEditableRef();
    this.unsubscribe();
  }

  stopEvent(event: Event) {
    if (event.type === "dragstart") {
      event.preventDefault();
    }

    return !this.editable;
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
