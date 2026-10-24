/**
 * The Petrinaut DSL as a Monaco language: a Monarch tokenizer for the
 * declarations, with each code block's body handed to Monaco's TypeScript
 * tokenizer. The printer closes a body with a brace at the keyword's
 * indentation, and the body's own braces are counted, so the embedded
 * region ends at the right one.
 */

import {
  dslAttributeKeywords,
  dslCodeKeywords,
  dslDeclarationKeywords,
  dslValueTypes,
} from "@hashintel/petrinaut-core";

import type { languages } from "monaco-editor";
import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api.js";

export const dslLanguageId = "petrinaut";

// A hyphen is literal outside a character class, so the words join as they are.
const alternatives = (words: readonly string[]): string => words.join("|");

const dslMonarchLanguage: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".petrinaut",
  tokenizer: {
    root: [
      [/\/\/\/.*$/u, "comment.doc"],
      [/\/\/.*$/u, "comment"],
      [
        new RegExp(
          `\\b(${alternatives(dslCodeKeywords)})\\b(?=[^{\\n]*\\{)`,
          "u",
        ),
        { token: "keyword.code", next: "@codeHead" },
      ],
      [
        new RegExp(`\\b(${alternatives(dslDeclarationKeywords)})\\b`, "u"),
        "keyword",
      ],
      [
        new RegExp(`\\b(${alternatives(dslAttributeKeywords)})\\b`, "u"),
        "keyword.attribute",
      ],
      [new RegExp(`\\b(${alternatives(dslValueTypes)})\\b`, "u"), "type"],
      [/"(?:[^"\\]|\\.)*"/u, "string"],
      [/-?\d+(?:\.\d+)?/u, "number"],
      [/->/u, "operator"],
      [/[{}]/u, "delimiter.bracket"],
      [/[A-Z][A-Za-z0-9_$]*/u, "type.identifier"],
      [/[a-z_$][A-Za-z0-9_$]*/u, "identifier"],
      [/[,:=().]/u, "delimiter"],
      [/\s+/u, "white"],
    ],
    // The rest of a code keyword's line up to the brace that opens its body:
    // the equation's or metric's name and the dynamics' type.
    codeHead: [
      [/"(?:[^"\\]|\\.)*"/u, "string"],
      [/[()]/u, "delimiter.parenthesis"],
      [/[A-Za-z_$][A-Za-z0-9_$]*/u, "type.identifier"],
      [
        /\{/u,
        {
          token: "delimiter.bracket",
          switchTo: "@codeBody",
          nextEmbedded: "typescript",
        },
      ],
      [/\s+/u, "white"],
    ],
    // Inside the body. Only the state changes matter here: the text is
    // coloured by the embedded TypeScript tokenizer.
    codeBody: [
      [/\{/u, { token: "", next: "@codeNested" }],
      [/\}/u, { token: "@rematch", next: "@pop", nextEmbedded: "@pop" }],
      [/[^{}]+/u, ""],
    ],
    codeNested: [
      [/\{/u, { token: "", next: "@push" }],
      [/\}/u, { token: "", next: "@pop" }],
      [/[^{}]+/u, ""],
    ],
  },
};

const dslLanguageConfiguration: languages.LanguageConfiguration = {
  comments: { lineComment: "//" },
  brackets: [
    ["{", "}"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
  ],
  folding: {
    markers: {
      start: /\{\s*$/u,
      end: /^\s*\}/u,
    },
  },
};

const registered = new WeakSet<object>();

/** Registers the DSL with a Monaco instance, once per instance. */
export const registerDslLanguage = (monaco: typeof Monaco): void => {
  if (registered.has(monaco)) {
    return;
  }
  registered.add(monaco);
  monaco.languages.register({ id: dslLanguageId, extensions: [".petrinaut"] });
  monaco.languages.setMonarchTokensProvider(dslLanguageId, dslMonarchLanguage);
  monaco.languages.setLanguageConfiguration(
    dslLanguageId,
    dslLanguageConfiguration,
  );
};
