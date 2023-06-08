import { toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { Node, NodeSpec, NodeType, Schema } from "prosemirror-model";

import { paragraphBlockComponentId } from "./blocks";

type NodeWithAttrs<Attrs extends {}> = Omit<Node, "attrs"> & {
  attrs: Attrs;
};

type ComponentNodeAttrs = {};
export type ComponentNode = NodeWithAttrs<ComponentNodeAttrs>;

export type EntityNode = NodeWithAttrs<{
  // @todo how can this ever be null?
  draftId: string | null;
}>;

export type NodeSpecs = {
  [name: string]: NodeSpec;
};

export const isEntityNode = (node: Node | null): node is EntityNode =>
  !!node && node.type === node.type.schema.nodes.entity;

export const componentNodeGroupName = "componentNode";

export const textNode: NodeSpec = {
  group: "inline",
};

export const hardBreakNode: NodeSpec = {
  inline: true,
  group: "inline",
  selectable: false,
  parseDOM: [{ tag: "br" }],
  toDOM() {
    return ["br"];
  },
};

export const mentionNode: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  attrs: { mentionType: { default: null }, entityId: { default: null } },
  toDOM: (node) => {
    const { mentionType, entityId } = node.attrs;
    return [
      "span",
      {
        "data-hash-type": "mention",
        "data-mention-type": mentionType,
        "data-entity-id": entityId,
      },
    ];
  },
  parseDOM: [
    {
      tag: 'span[data-hash-type="mention"]',
      getAttrs(dom) {
        return {
          mentionType: (dom as Element).getAttribute("data-mention-type"),
          entityId: (dom as Element).getAttribute("data-entity-id"),
        };
      },
    },
  ],
};

export const loadingNode: NodeSpec = {
  /**
   * As we don't have any component nodes defined by default, we need a
   * placeholder, otherwise Prosemirror will crash when trying to
   * interpret the content expressions in other nodes. However, as soon
   * as we have defined a different component node, we remove the blank
   * node from the componentNode group, which ensures that when
   * Prosemirror attempts to instantiate a componentNode it uses that
   * node instead of the blank one
   *
   * @see import("./ProsemirrorManager.ts").ProsemirrorManager#prepareToDisableBlankDefaultComponentNode
   */
  group: componentNodeGroupName,
  toDOM: () => ["div", 0],
};

export const blockNode: NodeSpec = {
  content: "entity",
  /**
   * These properties are necessary for copy and paste (which is
   * necessary for drag and drop)
   *
   * @note – the actual rendering in the DOM is taken over by the NodeView
   *         so check `BlockView` and `ComponentView` for how this will
   *         actually appear
   */
  toDOM: () => {
    return [
      "div",
      {
        "data-hash-type": "block",
      },
      0,
    ];
  },
  parseDOM: [
    {
      tag: 'div[data-hash-type="block"]',
    },
  ],
};

export const entityNode: NodeSpec = {
  content: "componentNode | entity",
  attrs: {
    draftId: { default: null },
  },
  toDOM: () => {
    return ["div", { "data-hash-type": "entity" }, 0];
  },
  parseDOM: [
    {
      tag: 'div[data-hash-type="entity"]',
    },
  ],
};

export const textTokenNodes = {
  text: textNode,
  hardBreak: hardBreakNode,
  mention: mentionNode,
};

export const pageEditorNodes = {
  loading: loadingNode,
  block: blockNode,
  entity: entityNode,
};

export const createSchema = (nodes: NodeSpecs) =>
  new Schema({
    nodes,
    marks: {
      strong: {
        toDOM: () => ["strong", { style: "font-weight:bold;" }, 0],
        parseDOM: [
          { tag: "strong" },
          /**
           * This works around a Google Docs misbehavior where
           * pasted content will be inexplicably wrapped in `<b>`
           * tags with a font-weight normal.
           * @see https://github.com/ProseMirror/prosemirror-schema-basic/blob/860d60f764dcdcf186bcba0423d2c589a5e34ae5/src/schema-basic.js#L136
           */
          {
            tag: "b",
            getAttrs: (node) => {
              /**
               * It is always a Node for tag rules but the types aren't
               * smart enough for that
               *
               * @todo remove the need for this cast
               */
              const castNode = node as unknown as HTMLElement;

              return castNode.style.fontWeight !== "normal" && null;
            },
          },
          {
            style: "font-weight",
            getAttrs(value) {
              /**
               * It is always a string for style rules but the types aren't
               * smart enough for that
               *
               * @todo remove the need for this cast
               */
              const castValue = value as unknown as string;
              if (/^(bold(er)?|[5-9]\d{2,})$/.test(castValue)) {
                return null;
              }
              return false;
            },
          },
        ],
      },
      em: {
        toDOM: () => ["em", 0],
        parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
      },
      /**
       * Some apps export underlines as HTML includes a style tag
       * creating some classes, which are then applied to the underlined
       * text. This includes Pages. It has not yet been figured out how to
       * handle this within Prosemirror, so this formatting will be lost
       * when pasting from these apps.
       *
       * @todo fix this
       */
      underlined: {
        toDOM: () => ["u", 0],
        parseDOM: [
          { tag: "u" },
          { style: "text-decoration=underline" },
          { style: "text-decoration-line=underline" },
        ],
      },
      strikethrough: {
        toDOM: () => ["s", 0],
        parseDOM: [
          { tag: "s" },
          { style: "text-decoration=line-through" },
          { style: "text-decoration-line=line-through" },
        ],
      },
      highlighted: {
        toDOM: () => ["span", { style: "background-color: #ff8" }, 0],
        parseDOM: [{ style: "background-color=#ff8" }],
      },
      link: {
        attrs: {
          href: { default: "" },
        },
        inclusive: false,
        toDOM(node) {
          const { href } = node.attrs;
          return [
            "a",
            { href, style: "color: blue; text-decoration: underline" },
            0,
          ];
        },
        parseDOM: [
          {
            tag: "a[href]",
            getAttrs(dom) {
              return {
                href: (dom as Element).getAttribute("href"),
              };
            },
          },
        ],
      },
    },
  });

export const isComponentNodeType = (nodeType: NodeType) =>
  nodeType.groups?.includes(componentNodeGroupName) ?? false;

export const isComponentNode = (node: Node): node is ComponentNode =>
  isComponentNodeType(node.type);

export const findComponentNodes = (containingNode: Node): ComponentNode[] => {
  const componentNodes: ComponentNode[] = [];

  containingNode.descendants((node) => {
    if (isComponentNode(node)) {
      componentNodes.push(node);
    }

    return true;
  });

  return componentNodes;
};

export const findComponentNode = (
  containingNode: Node,
  containingNodePosition: number,
): [ComponentNode, number] | null => {
  let result: [ComponentNode, number] | null = null;

  containingNode.descendants((node, pos) => {
    if (isComponentNode(node)) {
      result = [node, containingNodePosition + 1 + pos];

      return false;
    }

    return true;
  });

  return result;
};

export const componentNodeToId = (node: ComponentNode) => node.type.name;

declare interface OrderedMapPrivateInterface<T> {
  content: (string | T)[];
}

/**
 * Prosemirror is designed for you to design your document schema ahead of time
 * and for this not to change during the lifetime of your document. We support
 * dynamically loaded in new blocks, which requires creating new node types,
 * which therefore requires mutating the Prosemirror schema. This is not
 * officially supported, so we had to develop a hack to force Prosemirror to
 * mutate the schema for us to apply the expected changes for a new node type.
 *
 * We want to have the hacks necessary for this in one place, so this allows
 * a user to pass a function which will apply the mutations they want to apply,
 * and the relevant hacks are then applied after to process the mutation.
 *
 * This also deals with deleting the default "loading" node type which we create
 * when first creating a new schema before any blocks have been loaded in.
 */
export const mutateSchema = (
  schema: Schema,
  mutate: (map: OrderedMapPrivateInterface<NodeSpec>) => void,
) => {
  mutate(schema.spec.nodes as any);
  const loadingType = schema.nodes.loading!;

  if (isComponentNodeType(loadingType)) {
    if (loadingType.spec.group?.includes(componentNodeGroupName)) {
      if (loadingType.spec.group !== componentNodeGroupName) {
        throw new Error(
          "Loading node type has group expression more complicated than we can handle",
        );
      }

      delete loadingType.spec.group;
    }

    loadingType.groups!.splice(
      loadingType.groups!.indexOf(componentNodeGroupName),
      1,
    );
  }

  // eslint-disable-next-line no-new
  new (class extends Schema {
    // @ts-expect-error: This is one of the hacks in our code to allow defining new node types at run time which isn't officially supported in ProseMirror
    get nodes() {
      return schema.nodes;
    }

    set nodes(newNodes) {
      for (const [key, value] of Object.entries(newNodes)) {
        if (!this.nodes[key]) {
          // @ts-expect-error -- NodeType#schema is readonly in prosemirror-model
          value.schema = schema;
          // @ts-expect-error -- NodeType#nodes is readonly in prosemirror-model
          this.nodes[key] = value;
        } else {
          this.nodes[key]!.contentMatch = value.contentMatch;
        }
      }
    }

    // @ts-expect-error: This is one of the hacks in our code to allow defining new node types at run time which isn't officially supported in ProseMirror
    get marks() {
      return schema.marks;
    }

    set marks(newMarks) {
      for (const [key, value] of Object.entries(newMarks)) {
        if (!this.marks[key]) {
          // @ts-expect-error -- NodeType#schema is readonly in prosemirror-model
          value.schema = schema;
          // @ts-expect-error -- NodeType#nodes is readonly in prosemirror-model
          this.marks[key] = value;
        }
      }
    }
  })(schema.spec);
};

export const isParagraphNode = (node: Node) => {
  return componentNodeToId(node) === paragraphBlockComponentId;
};

export const formatKeymap = (schema: Schema) =>
  keymap({
    // Mod- stands for Cmd- o macOS and Ctrl- elsewhere
    "Mod-b": toggleMark(schema.marks.strong!),
    "Mod-i": toggleMark(schema.marks.em!),
    "Mod-u": toggleMark(schema.marks.underlined!),
    // We add an extra shortcut on macOS to mimic raw Chrome’s contentEditable.
    // ProseMirror normalizes keys, so we don’t get two self-cancelling handlers.
    "Ctrl-u": toggleMark(schema.marks.underlined!),

    "Shift-Enter": (state, dispatch) => {
      dispatch?.(
        state.tr
          .replaceSelectionWith(schema.nodes.hardBreak!.create())
          .scrollIntoView(),
      );
      return true;
    },
    // execCommand is flagged as depecrated but it seems that there isn't a viable alternative
    // to call the undo and redo default browser actions (https://stackoverflow.com/a/70831583)
    // After the collab rework this should be replaced with a proper implementation
    "Mod-z": () => document.execCommand("undo"),
    "Mod-y": () => document.execCommand("redo"),
    "Mod-Shift-z": () => document.execCommand("redo"),
  });
