import {
  blockComponentRequiresText,
  BlockConfig,
  BlockMeta,
} from "@hashintel/hash-shared/blockMeta";
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
import { EditorView, NodeView } from "prosemirror-view";
import { BlockLoader } from "../../components/BlockLoader/BlockLoader";
import { ErrorBlock } from "../../components/ErrorBlock/ErrorBlock";
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
  dom: HTMLDivElement = document.createElement("div");
  contentDOM: HTMLElement | undefined = undefined;
  editable: boolean;

  private target = createComponentViewTarget();

  private readonly componentId: string;
  private readonly componentMetadata: BlockConfig;
  private readonly sourceName: string;

  private store: EntityStore;
  private unsubscribe: Function;

  constructor(
    private node: ProsemirrorNode<Schema>,
    public editorView: EditorView<Schema>,
    public getPos: () => number,
    private renderPortal: RenderPortal,
    private meta: BlockMeta,
  ) {
    const { componentMetadata, componentSchema } = meta;
    const { source } = componentMetadata;

    if (!source) {
      throw new Error("Cannot create new block for component missing a source");
    }

    this.sourceName = source;
    this.componentMetadata = componentMetadata;
    this.componentId = componentMetadata.componentId;

    this.dom.setAttribute("data-dom", "true");

    this.editable = blockComponentRequiresText(componentSchema);

    if (this.editable) {
      this.contentDOM = document.createElement("div");
      this.contentDOM.setAttribute("data-contentDOM", "true");
      this.contentDOM.style.display = "none";
      this.dom.appendChild(this.contentDOM);
    }

    this.dom.appendChild(this.target);

    this.store = entityStorePluginState(editorView.state).store;
    this.unsubscribe = subscribeToEntityStore(this.editorView, (store) => {
      this.store = store;
      this.update(this.node);
    });

    this.update(this.node);
  }

  update(node: ProsemirrorNode<Schema>) {
    this.node = node;

    if (isComponentNode(node) && componentNodeToId(node) === this.componentId) {
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
        scope.setTag("block", this.componentId);
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
            sourceUrl={this.sourceName}
            blockEntityId={entityId}
            blockMetadata={this.componentMetadata}
            // shouldSandbox={!this.editable}
            editableRef={this.editable ? this.editableRef : undefined}
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

  editableRef = (editableNode: HTMLElement) => {
    if (
      this.contentDOM &&
      editableNode &&
      !editableNode.contains(this.contentDOM)
    ) {
      editableNode.appendChild(this.contentDOM);
      this.contentDOM.style.display = "";
    }
  };

  destroy() {
    this.dom.remove();
    this.renderPortal(null, this.target);
    this.unsubscribe();
  }

  stopEvent(event: Event) {
    if (event.type === "dragstart") {
      event.preventDefault();
    }

    return !blockComponentRequiresText(this.meta.componentSchema);
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

    const handledByReact =
      event.type === "childList"
        ? targetIsOutsideContentDOM
        : targetIsOutsideContentDOM || targetIsContentDom;

    return handledByReact;
  }
}
