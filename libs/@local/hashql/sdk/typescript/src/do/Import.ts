/**
 * Lexical imports shared by the Do authoring operations.
 *
 * The emitted import binds selected names locally. Export handles receive those local paths while retaining the module's declared types. The compiler resolves the import itself.
 *
 * @module
 */
// oxlint-disable import/max-dependencies -- an import updates the module, type and value universes together
import { Result } from "effect";

import { isReadonlyArray } from "../internal/array.js";
import * as JExpr from "../jexpr/index.js";
import * as AST from "../program/ast/index.js";
import * as Expression from "../program/Expression.js";
import * as Module from "../program/Module.js";
import * as ProgramError from "../program/ProgramError.js";
import * as Scope from "../program/Scope.js";
import * as TypeExpression from "../program/TypeExpression.js";
import * as Node from "./Node.js";

import type * as Inputs from "../program/Inputs.js";
import type { Utilities } from "./Utilities.js";
import type { ReadonlyRecord } from "effect/Record";

type Name<M extends Module.Any> = Extract<
  keyof M["modules"] | keyof M["values"] | keyof M["types"],
  string
>;

export type Selection<M extends Module.Any> =
  | "*"
  | readonly Name<M>[]
  | Partial<ReadonlyRecord<Name<M>, string>>;

type Selected<Exports, Imports> = Imports extends "*"
  ? Exports
  : Imports extends readonly string[]
    ? Pick<Exports, Extract<keyof Exports, Imports[number]>>
    : {
        readonly [Key in keyof Exports as Key extends keyof Imports
          ? Imports[Key] extends "_"
            ? Key
            : Imports[Key] extends string
              ? Imports[Key]
              : never
          : never]: Exports[Key];
      };

export interface Imported<M extends Module.Any, Imports> {
  readonly modules: Selected<M["modules"], Imports>;
  readonly values: Selected<M["values"], Imports>;
  readonly types: Selected<M["types"], Imports>;
}

/** Imports selected module exports into their respective universes. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the selector and selection construct a declaration step
export function Import<In extends Scope.Scope, M extends Module.Any>(
  select: (utilities: Utilities<In>, modules: In["modules"]) => M,
): Node.Node<In, Scope.Merge<In, M>, Inputs.Empty>;
export function Import<
  In extends Scope.Scope,
  M extends Module.Any,
  const Imports extends Selection<M>,
>(
  select: (utilities: Utilities<In>, modules: In["modules"]) => M,
  imports: Imports,
): Node.Node<In, Scope.Merge<In, Imported<M, Imports>>, Inputs.Empty>;
export function Import<In extends Scope.Scope>(
  select: (utilities: Utilities<In>, modules: In["modules"]) => Module.Any,
  // oxlint-disable-next-line hash/prefer-options-object -- the optional argument is the import selection itself
  imports: JExpr.Imports = "*",
): Node.Any {
  return Node.make((utilities: Utilities<In>, scope: In) =>
    Result.gen(function* () {
      const module = select(utilities, scope.modules);

      const names: [string, string][] = [];

      if (imports === "*") {
        for (const name of new Set([
          ...Object.keys(module.modules),
          ...Object.keys(module.values),
          ...Object.keys(module.types),
        ])) {
          names.push([name, name]);
        }
      } else if (isReadonlyArray(imports)) {
        for (const name of imports) {
          names.push([name, name]);
        }
      } else {
        for (const [name, alias] of Object.entries(imports)) {
          if (alias === "_") {
            names.push([name, name]);
          } else {
            names.push([name, alias]);
          }
        }
      }

      const modules: [string, Module.Any][] = [];
      const values: [string, Expression.Any][] = [];
      const types: [string, TypeExpression.Export][] = [];
      const renamed: [string, string][] = [];
      const selected: string[] = [];

      for (const [name, alias] of names) {
        const ident = yield* JExpr.Ident.decodeResult(alias).pipe(
          Result.mapError(
            (cause) =>
              new ProgramError.Construction({
                reason: ProgramError.Reason.InvalidImportName({
                  name: alias,
                  cause,
                }),
              }),
          ),
        );
        selected.push(name);
        renamed.push([name, JExpr.Ident.compile(ident)]);

        const path = { rooted: false, segments: [ident] as const };
        const child = module.modules[name];
        if (child !== undefined) {
          modules.push([alias, yield* Module.relocate(child, path)]);
        }

        if (module.values[name] !== undefined) {
          values.push([
            alias,
            Expression.fromJExpr(JExpr.Ident.compile(ident)),
          ]);
        }

        const type = module.types[name];
        if (type !== undefined) {
          types.push([
            alias,
            yield* TypeExpression.relocate<TypeExpression.Export>(type, path),
          ]);
        }
      }

      const added = {
        modules: Object.fromEntries(modules),
        values: Object.fromEntries(values),
        types: Object.fromEntries(types),
      };

      let emitted: JExpr.Imports = "*";
      if (isReadonlyArray(imports)) {
        emitted = Object.freeze(selected);
      } else if (imports !== "*") {
        emitted = Object.freeze(Object.fromEntries(renamed));
      }

      return {
        scope: Scope.merge(scope, added),
        wrap: (child) => new AST.Import(module.path, emitted, child),
      };
    }),
  );
}
