import { Schema } from "prosemirror-model";
import { Text, TextPropertiesText } from "./graphql/apiTypes.gen";
import { ProsemirrorNode } from "./node";

export const childrenForTextEntity = (
  entity: Pick<Text, "properties">,
  schema: Schema
): ProsemirrorNode<Schema>[] =>
  entity.properties.texts.map((text) =>
    schema.text(
      text.text,
      [
        ["strong", text.bold] as const,
        ["underlined", text.underline] as const,
        ["em", text.italics] as const,
      ]
        .filter(([, include]) => include)
        .map(([mark]) => schema.mark(mark))
    )
  );

export const nodeToEntityProperties = (node: ProsemirrorNode<Schema>) => {
  if (node.type.isTextblock) {
    const texts: TextPropertiesText[] = [];

    node.content.descendants((child) => {
      if (child.type.name === "text") {
        const marks = new Set<string>(
          child.marks.map((mark) => mark.type.name)
        );

        texts.push({
          text: child.text ?? "",
          ...(marks.has("strong") ? { bold: true } : {}),
          ...(marks.has("em") ? { italics: true } : {}),
          ...(marks.has("underlined") ? { underline: true } : {}),
        });
      }
    });

    return { texts };
  }

  return {};
};

type NodeWithAttrs<Attrs extends {}> = Omit<
  ProsemirrorNode<Schema>,
  "attrs"
> & { attrs: Attrs };

export type ComponentNode = NodeWithAttrs<{
  blockEntityId: string | null;
}>;

export type EntityNode = NodeWithAttrs<{
  entityId: string | null;
  draftId: string | null;
}>;

export const isEntityNode = (
  node: ProsemirrorNode<Schema> | null
): node is EntityNode => !!node && node.type === node.type.schema.nodes.entity;

/**
 * @todo use group name for this
 */
export const isComponentNode = (
  node: ProsemirrorNode<Schema>
): node is ComponentNode =>
  !!node.type.spec.attrs && "blockEntityId" in node.type.spec.attrs;

export const findComponentNodes = (doc: ProsemirrorNode<Schema>) => {
  const componentNodes: [ComponentNode, number][] = [];

  doc.descendants((node, pos) => {
    if (isComponentNode(node)) {
      componentNodes.push([node, pos]);
    }

    return true;
  });

  return componentNodes;
};

export const getComponentNodeAttrs = (
  entity?: { entityId?: string | null } | null
) => ({
  blockEntityId: entity?.entityId ?? "",
});

export const componentNodeToId = (node: ComponentNode) => node.type.name;
