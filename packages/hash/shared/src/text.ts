import { ProsemirrorNode, Schema } from "prosemirror-model";
import { ComponentNode } from "./prosemirror";
import { Text, TextProperties } from "./graphql/apiTypes.gen";
import { TextToken } from "./graphql/types";

export const textBlockNodesFromTokens = (
  tokens: TextToken[],
  schema: Schema,
): ProsemirrorNode<Schema>[] =>
  tokens
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

export const childrenForTextEntity = (
  entity: Pick<Text, "properties">,
  schema: Schema,
): ProsemirrorNode<Schema>[] =>
  textBlockNodesFromTokens(entity.properties.tokens, schema);

export const textBlockNodeToEntityProperties = (
  node: ComponentNode,
): TextProperties => {
  const tokens: TextToken[] = [];

  node.content.descendants((child) => {
    if (!child.isInline) {
      return;
    }

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
