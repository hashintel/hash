import { DocPlainText } from "@microsoft/tsdoc";
import { Array, Option, Result, Schema, String, pipe } from "effect";

import * as AST from "../AST/index.js";
import * as DocumentationError from "../DocumentationError.js";
import * as DocTags from "./doc-tags.js";

import type { DocBlock, TSDocTagDefinition } from "@microsoft/tsdoc";

/** The plain text of a block's paragraphs, trimmed. Code spans and links do not count towards the word. */
const wordOf = (block: DocBlock): string =>
  pipe(
    block.content.nodes,
    Array.flatMap((node) => node.getChildNodes()),
    Array.filter((node) => node instanceof DocPlainText),
    Array.map((node) => node.text),
    Array.join(""),
    String.trim,
  );

/** The one block a singleton tag allows. A repeat fails rather than letting either occurrence win. */
const single = (
  file: string,
  definition: TSDocTagDefinition,
  blocks: readonly DocBlock[],
): Result.Result<
  Option.Option<DocBlock>,
  DocumentationError.DocumentationError
> => {
  const found = Array.filter(blocks, (block) =>
    DocTags.is(definition)(block.blockTag),
  );

  if (found.length > 1) {
    return Result.fail(
      DocumentationError.DocumentationError.make({
        file,
        reason: { _tag: "DuplicateTag", tag: definition.tagName },
      }),
    );
  }

  return Result.succeed(Array.head(found));
};

/** A comment's custom blocks, with the file a failure names. */
export interface Input {
  readonly file: string;
  readonly blocks: readonly DocBlock[];
}

/** Selects the comment's `@since` from its custom blocks. */
export const since = ({
  file,
  blocks,
}: Input): Result.Result<
  Option.Option<AST.Documentation.Since.Since>,
  DocumentationError.DocumentationError
> =>
  single(file, DocTags.since, blocks).pipe(
    Result.map(
      Option.map((node) =>
        AST.Documentation.Since.make({ node, version: wordOf(node) }),
      ),
    ),
  );

/** Selects the comment's `@category` from its custom blocks. */
export const category = ({
  file,
  blocks,
}: Input): Result.Result<
  Option.Option<AST.Documentation.Category.Category>,
  DocumentationError.DocumentationError
> =>
  single(file, DocTags.category, blocks).pipe(
    Result.map(
      Option.map((node) =>
        AST.Documentation.Category.make({ node, name: wordOf(node) }),
      ),
    ),
  );

/** Selects the comment's `@stability` from its custom blocks and rejects a label outside {@link AST.Documentation.Stability.Level}. */
export const stability = ({
  file,
  blocks,
}: Input): Result.Result<
  Option.Option<AST.Documentation.Stability.Stability>,
  DocumentationError.DocumentationError
> =>
  single(file, DocTags.stability, blocks).pipe(
    Result.flatMap(
      Result.transposeMapOption((node) =>
        pipe(
          wordOf(node),
          Schema.decodeUnknownResult(AST.Documentation.Stability.Level),
          Result.mapBoth({
            onFailure: (cause) =>
              DocumentationError.DocumentationError.make({
                file,
                reason: { _tag: "UnknownStability", cause },
              }),
            onSuccess: (level) =>
              AST.Documentation.Stability.make({ node, level }),
          }),
        ),
      ),
    ),
  );
