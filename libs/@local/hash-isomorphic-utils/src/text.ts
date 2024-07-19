import type { Node, Schema } from "prosemirror-model";

import type { TextProperties } from "./entity.js";
import { textualContentPropertyTypeBaseUrl } from "./entity-store.js";
import type { ComponentNode } from "./prosemirror.js";
import type { TextToken } from "./types.js";

export const textBlockNodesFromTokens = (
  tokens: TextToken[],
  schema: Schema,
): Node[] =>
  // eslint-disable-next-line array-callback-return -- TODO: disable the rule because it’s not aware of TS
  tokens.map((token) => {
    switch (token.tokenType) {
      case "hardBreak": {
        return schema.node("hardBreak");
      }
      case "mention": {
        return schema.node("mention", {
          mentionType: token.mentionType,
          entityId: token.entityId,
          propertyTypeBaseUrl: token.propertyTypeBaseUrl,
          linkEntityTypeBaseUrl: token.linkEntityTypeBaseUrl,
        });
      }
      case "text": {
        return schema.text(
          token.text,
          [
            ["strong", token.bold] as const,
            ["underlined", token.underline] as const,
            ["em", token.italics] as const,
            ["strikethrough", token.strikethrough] as const,
            ["highlighted", token.highlighted] as const,
            [
              "link",
              Boolean(token.link),
              token.link ? { href: token.link } : undefined,
            ] as const,
          ]
            .filter(([, include]) => include)
            .map(([mark, _, attributes]) => schema.mark(mark, attributes)),
        );
      }
    }
  });

export const childrenForTextEntity = (
  entity: { properties: TextProperties },
  schema: Schema,
): Node[] =>
  textBlockNodesFromTokens(
    entity.properties[textualContentPropertyTypeBaseUrl] ?? [],
    schema,
  );

export const textBlockNodeToTextTokens = (node: ComponentNode): TextToken[] => {
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
          propertyTypeBaseUrl: child.attrs.propertyTypeBaseUrl,
          linkEntityTypeBaseUrl: child.attrs.linkEntityTypeBaseUrl,
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
          ...(marks.has("strikethrough") ? { strikethrough: true } : {}),
          ...(marks.has("highlighted") ? { highlighted: true } : {}),
          ...(marks.has("link")
            ? {
                link: child.marks.find((mark) => mark.type.name === "link")
                  ?.attrs.href,
              }
            : {}),
        });
        break;
      }
    }
  });

  return tokens;
};

export const textBlockNodeToEntityProperties = (
  node: ComponentNode,
): TextProperties => ({
  [textualContentPropertyTypeBaseUrl]: textBlockNodeToTextTokens(node),
});
