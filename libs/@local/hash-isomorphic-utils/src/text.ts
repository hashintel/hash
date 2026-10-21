import { blockProtocolPropertyTypes } from "./ontology-type-ids.js";

import type { TextProperties } from "./entity.js";
import type { ComponentNode } from "./prosemirror.js";
import type { TextToken } from "./types.js";
import type { Node, Schema } from "prosemirror-model";

const textualContentPropertyTypeBaseUrl =
  blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl;

type MentionToken = Extract<TextToken, { tokenType: "mention" }>;

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
              token.link !== undefined && token.link !== "",
              token.link !== undefined && token.link !== ""
                ? { href: token.link }
                : undefined,
            ] as const,
          ]
            .filter(([, include]) => include ?? false)
            .map(([mark, , attrs]) => schema.mark(mark, attrs)),
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
        // SAFETY: the schema's `mention` node declares exactly these attributes, with these types.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- prosemirror types `attrs` as an untyped record, so the schema is the only source of these types
        const mentionAttrs = child.attrs as Omit<MentionToken, "tokenType">;

        tokens.push({
          tokenType: "mention",
          mentionType: mentionAttrs.mentionType,
          entityId: mentionAttrs.entityId,
          propertyTypeBaseUrl: mentionAttrs.propertyTypeBaseUrl,
          linkEntityTypeBaseUrl: mentionAttrs.linkEntityTypeBaseUrl,
        });
        break;
      }
      case "text": {
        const marks = new Set<string>(
          child.marks.map((mark) => mark.type.name),
        );

        const linkMark = child.marks.find((mark) => mark.type.name === "link");
        // SAFETY: the schema's `link` mark declares `href` as a string.
        const linkHref = (linkMark?.attrs as { href?: string } | undefined)
          ?.href;

        tokens.push({
          tokenType: "text",
          text: child.text ?? "",
          ...(marks.has("strong") ? { bold: true } : {}),
          ...(marks.has("em") ? { italics: true } : {}),
          ...(marks.has("underlined") ? { underline: true } : {}),
          ...(marks.has("strikethrough") ? { strikethrough: true } : {}),
          ...(marks.has("highlighted") ? { highlighted: true } : {}),
          ...(marks.has("link") ? { link: linkHref } : {}),
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
