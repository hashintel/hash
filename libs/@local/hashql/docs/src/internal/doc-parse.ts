import { TextRange } from "@microsoft/tsdoc";
import { Array, Option, Result, pipe } from "effect";

import * as AST from "../AST/index.js";
import * as DocumentationError from "../DocumentationError.js";
import * as DocExample from "./doc-example.js";
import * as DocMetadata from "./doc-metadata.js";
import * as DocTags from "./doc-tags.js";

import type {
  DocBlock,
  DocComment,
  TSDocParser,
  TSDocTagDefinition,
} from "@microsoft/tsdoc";
import type { JSDoc } from "typescript/ast";

/** Custom blocks with a node of their own, which therefore stay out of `customBlocks`. */
const dedicated: readonly TSDocTagDefinition[] = [
  DocTags.example,
  DocTags.throws,
  DocTags.since,
  DocTags.category,
  DocTags.stability,
];

const optional = <N, A>(
  node: N | undefined,
  make: (fields: { readonly node: N }) => A,
): Option.Option<A> =>
  Option.map(Option.fromUndefinedOr(node), (value) => make({ node: value }));

const each = <N, A>(
  nodes: readonly N[],
  make: (fields: { readonly node: N }) => A,
): A[] => Array.map(nodes, (node) => make({ node }));

/** TSDoc reads the comment in place, so every position it records is an offset into the comment's source file. */
const tsdocOf = (
  parser: TSDocParser,
  node: JSDoc,
): Result.Result<DocComment, DocumentationError.DocumentationError> => {
  const file = node.getSourceFile();
  const { docComment, log } = parser.parseRange(
    TextRange.fromStringRange(file.text, node.pos, node.end),
  );

  if (log.messages.length > 0) {
    return Result.fail(
      DocumentationError.DocumentationError.make({
        file: file.fileName,
        reason: {
          _tag: "InvalidComment",
          diagnostics: Array.map(
            log.messages,
            ({ messageId, text, textRange }) => ({
              messageId,
              text,
              start: textRange.pos,
              end: textRange.end,
            }),
          ),
        },
      }),
    );
  }

  return Result.succeed(docComment);
};

/**
 * Parses a compiler comment into a documentation node, without resolving names or choosing a presentation.
 *
 * Any TSDoc diagnostic fails the comment. Beyond TSDoc's own grammar, validation covers the blocks whose meaning TSDoc leaves to this reference: examples, and the singleton `@since`, `@category` and `@stability`. Every other block is kept as TSDoc parsed it.
 */
export const parse =
  (parser: TSDocParser) =>
  (
    node: JSDoc,
  ): Result.Result<
    AST.Documentation.Documentation,
    DocumentationError.DocumentationError
  > =>
    Result.gen(function* () {
      const comment = yield* tsdocOf(parser, node);
      const file = node.getSourceFile().fileName;
      const custom = comment.customBlocks;
      const tagged = (definition: TSDocTagDefinition): DocBlock[] =>
        Array.filter(custom, (block) => DocTags.is(definition)(block.blockTag));

      const since = yield* DocMetadata.since({ file, blocks: custom });
      const category = yield* DocMetadata.category({ file, blocks: custom });
      const stability = yield* DocMetadata.stability({ file, blocks: custom });
      const examples = yield* pipe(
        tagged(DocTags.example),
        Array.map(DocExample.parse(file)),
        Result.all,
      );

      const modifiers = each(
        comment.modifierTagSet.nodes,
        AST.Documentation.Modifier.make,
      );
      const modifier = (
        definition: TSDocTagDefinition,
      ): Option.Option<AST.Documentation.Modifier.Modifier> =>
        Array.findFirst(modifiers, ({ node }) => DocTags.is(definition)(node));

      return AST.Documentation.make({
        node,
        source: comment,
        remarks: optional(comment.remarksBlock, AST.Documentation.Remarks.make),
        parameters: each(
          comment.params.blocks,
          AST.Documentation.Parameter.make,
        ),
        typeParameters: each(
          comment.typeParams.blocks,
          AST.Documentation.TypeParameter.make,
        ),
        returns: optional(comment.returnsBlock, AST.Documentation.Returns.make),
        throws: each(tagged(DocTags.throws), AST.Documentation.Throws.make),
        see: each(comment.seeBlocks, AST.Documentation.See.make),
        examples,
        since,
        category,
        stability,
        deprecated: optional(
          comment.deprecatedBlock,
          AST.Documentation.Deprecated.make,
        ),
        inheritDoc: optional(
          comment.inheritDocTag,
          AST.Documentation.InheritDoc.make,
        ),
        internal: modifier(DocTags.internal),
        trait: modifier(DocTags.trait),
        module: modifier(DocTags.moduleTag),
        modifiers,
        customBlocks: pipe(
          custom,
          Array.filter(
            (block) =>
              !Array.some(dedicated, (definition) =>
                DocTags.is(definition)(block.blockTag),
              ),
          ),
          Array.map((node) => AST.Documentation.CustomBlock.make({ node })),
        ),
      });
    });
