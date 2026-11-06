import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  TSDocConfiguration,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";
import { Context, Effect, Result } from "effect";

import * as DocumentationParser from "../../src/DocumentationParser.js";
import * as Parser from "../../src/Parser.js";
import * as TypeScript from "../../src/TypeScript/index.js";
import * as Compiler from "./compiler.js";

import type * as AST from "../../src/AST/index.js";
import type { Failure } from "../../src/internal/ast-context.js";

/** The tags and elements the package's own TSDoc configuration defines. */
export const configuration = (): TSDocConfiguration => {
  const value = new TSDocConfiguration();
  for (const tagName of ["@since", "@category", "@stability"]) {
    value.addTagDefinition(
      new TSDocTagDefinition({
        tagName,
        syntaxKind: TSDocTagSyntaxKind.BlockTag,
      }),
    );
  }
  for (const tagName of ["@module", "@trait"]) {
    value.addTagDefinition(
      new TSDocTagDefinition({
        tagName,
        syntaxKind: TSDocTagSyntaxKind.ModifierTag,
      }),
    );
  }
  value.setSupportedHtmlElements(["caption", "code"]);
  return value;
};

export const services = (
  fixture: Awaited<ReturnType<typeof Compiler.open>>,
): Context.Context<
  | TypeScript.Checker.Checker
  | TypeScript.Program.Program
  | DocumentationParser.DocumentationParser
> => {
  const checker = TypeScript.Checker.make({ checker: fixture.project.checker });
  const program = TypeScript.Program.make(fixture.snapshot);
  return Context.make(TypeScript.Checker.Checker, checker).pipe(
    Context.add(TypeScript.Program.Program, program),
    Context.add(
      DocumentationParser.DocumentationParser,
      DocumentationParser.make(configuration()),
    ),
  );
};

export const parse = async (
  options: Compiler.Options,
): Promise<Result.Result<AST.Store["Service"], Failure>> => {
  const fixture = await Compiler.open(options);
  try {
    return await Parser.parse([["fixture", fixture.source]]).pipe(
      Effect.map(({ ast }) => ast),
      Effect.scoped,
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This fixture entry point owns the filesystem the parse reads paths through.
      Effect.provide(NodeServices.layer),
      Effect.result,
      Effect.provide(services(fixture)),
      Effect.runPromise,
    );
  } finally {
    await fixture.api.close();
  }
};

export const success = async (
  options: Compiler.Options,
): Promise<AST.Store["Service"]> => {
  const result = await parse(options);
  return Result.getOrThrow(result);
};
