import { NodeType, ProsemirrorNode, Schema } from "prosemirror-model";
import { Text } from "./graphql/apiTypes.gen";
import { TextToken } from "./graphql/types";

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

export const textBlockNodeToEntityProperties = (
  node: ProsemirrorNode<Schema>,
) => {
  if (!node.isTextblock) {
    throw new Error("Can only be used on text blocks");
  }

  const tokens: TextToken[] = [];

  node.content.descendants((child) => {
    switch (child.type.name) {
      case "hardBreak": {
        tokens.push({ tokenType: "hardBreak" });
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
    }
  });

  return { tokens };
};

type NodeWithAttrs<Attrs extends {}> = Omit<
  ProsemirrorNode<Schema>,
  "attrs"
> & { attrs: Attrs };

type ComponentNodeAttrs = {};
export type ComponentNode = NodeWithAttrs<ComponentNodeAttrs>;

export type EntityNode = NodeWithAttrs<{
  draftId: string | null;
}>;

export const isEntityNode = (
  node: ProsemirrorNode<Schema> | null,
): node is EntityNode => !!node && node.type === node.type.schema.nodes.entity;

export const componentNodeGroupName = "componentNode";

export const isComponentNodeType = (nodeType: NodeType<Schema>) =>
  nodeType.groups?.includes(componentNodeGroupName) ?? false;

export const isComponentNode = (
  node: ProsemirrorNode<Schema>,
): node is ComponentNode => isComponentNodeType(node.type);

export const findComponentNodes = (
  containingNode: ProsemirrorNode<Schema>,
): ComponentNode[] => {
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
  containingNode: ProsemirrorNode<Schema>,
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
