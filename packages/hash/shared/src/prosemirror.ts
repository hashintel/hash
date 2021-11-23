import { Schema } from "prosemirror-model";
import { Text } from "./graphql/apiTypes.gen";
import { TextToken } from "./graphql/types";
import { ProsemirrorNode } from "./node";

export const childrenForTextEntity = (
  entity: Pick<Text, "properties">,
  schema: Schema,
): ProsemirrorNode<Schema>[] =>
  entity.properties.tokens
    // eslint-disable-next-line array-callback-return -- TODO: disable the rule because it’s not aware of TS
    .map((token) => {
      switch (token.tokenType) {
        case "hardBreak":
          return schema.node("hardBreak");
        case "mention":
          return schema.node("mention", {
            mentionType: token.mentionType,
            entityId: token.entityId,
          });
        case "text": {
          return schema.text(
            token.text,
            [
              ["strong", token.bold] as const,
              ["underlined", token.underline] as const,
              ["em", token.italics] as const,
              [
                "link",
                Boolean(token.link),
                token.link ? { href: token.link } : undefined,
              ] as const,
            ]
              .filter(([, include]) => include)
              .map(([mark, _, attrs]) => schema.mark(mark, attrs)),
          );
        }
      }
    });

export const nodeToEntityProperties = (node: ProsemirrorNode<Schema>) => {
  if (node.type.isTextblock) {
    const tokens: TextToken[] = [];

    node.content.descendants((child) => {
      switch (child.type.name) {
        case "text": {
          const marks = new Set<string>(
            child.marks.map((mark) => mark.type.name),
          );

          tokens.push({
            tokenType: "text",
            text: child.text ?? "",
            ...(marks.has("strong") ? { bold: true } : {}),
            ...(marks.has("em") ? { italics: true } : {}),
            ...(marks.has("underlined") ? { underline: true } : {}),
            ...(marks.has("link")
              ? {
                  link: child.marks.find((mark) => mark.type.name === "link")
                    ?.attrs?.href,
                }
              : {}),
          });
          break;
        }
        case "mention": {
          tokens.push({
            tokenType: "mention",
            mentionType: child.attrs.mentionType,
            entityId: child.attrs.entityId,
          });
          break;
        }
        case "hardBreak": {
          tokens.push({ tokenType: "hardBreak" });
          break;
        }
      }
    });

    return { tokens };
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
  node: ProsemirrorNode<Schema> | null,
): node is EntityNode => !!node && node.type === node.type.schema.nodes.entity;

/**
 * @todo use group name for this
 */
export const isComponentNode = (
  node: ProsemirrorNode<Schema>,
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
  entity?: { entityId?: string | null } | null,
) => ({
  blockEntityId: entity?.entityId ?? "",
});

export const componentNodeToId = (node: ComponentNode) => node.type.name;
