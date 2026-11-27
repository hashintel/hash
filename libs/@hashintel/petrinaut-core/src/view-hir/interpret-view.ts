/**
 * Direct evaluation of a lowered visualizer into element values the UI
 * renders, so no JavaScript from the net ever runs. Expressions evaluate
 * through the expression HIR's interpreter under the visualizer's rules: an
 * index past the end reads as `null`, as JavaScript's `undefined` would, so
 * `tokens[0] || fallback` draws an empty place.
 */
import { HirInterpretError, interpretHirExpr } from "../hir/interpret";

import type { HirExpr } from "../hir/hir";
import type { HirInterpretBindings, HirValue } from "../hir/interpret";
import type { ViewHir, ViewNode } from "./view-hir";

/**
 * A rendered element: the tag, its attributes, its React key and its
 * children, as plain data. A class rather than a record so it cannot be
 * confused with a user-keyed record (`instanceof` tells them apart).
 */
export class ViewElementValue {
  constructor(
    readonly tag: string,
    readonly attributes: ReadonlyMap<string, HirValue>,
    readonly key: HirValue | undefined,
    readonly children: readonly ViewValue[],
  ) {}
}

/** What a view node evaluates to: an element, a value written as text, or
 * one of those per array item. */
export type ViewValue = HirValue | ViewElementValue | readonly ViewValue[];

/** The tokens of one place for one frame, one record per token. */
export type ViewTokens = readonly Readonly<Record<string, HirValue>>[];

/**
 * The places of a net for one frame, by display name: how many tokens each
 * holds, and one record per token. Keyed by names a user chose: build it
 * with no prototype (`createUserKeyedRecord`).
 */
export type ViewPlaces = Readonly<
  Record<string, { count: number; tokens: Record<string, HirValue>[] }>
>;

/**
 * The component's props for one frame: the tokens a place's visualizer
 * draws, or the places a net's visualizer draws.
 */
export type ViewProps = {
  width: number;
  height: number;
  parameters: HirInterpretBindings["parameters"];
} & ({ tokens: ViewTokens } | { places: ViewPlaces });

type Locals = ReadonlyMap<string, HirValue>;

class ViewInterpreter {
  private readonly bindings: HirInterpretBindings;

  constructor(parameters: HirInterpretBindings["parameters"]) {
    this.bindings = { parameters, scenario: {} };
  }

  private evaluate(expr: HirExpr, locals: Locals): HirValue {
    return interpretHirExpr(expr, locals, this.bindings, {
      outOfRangeIndex: "null",
    });
  }

  draw(node: ViewNode, locals: Locals): ViewValue {
    switch (node.kind) {
      case "element": {
        const attributes = new Map<string, HirValue>();
        for (const attribute of node.attributes) {
          attributes.set(
            attribute.name,
            this.evaluate(attribute.value, locals),
          );
        }
        return new ViewElementValue(
          node.tag,
          attributes,
          node.key === undefined ? undefined : this.evaluate(node.key, locals),
          node.children.map((child) => this.draw(child, locals)),
        );
      }
      case "text":
        return node.value;
      case "expr":
        return this.evaluate(node.expr, locals);
      case "empty":
        return null;
      case "cond":
        return this.evaluate(node.condition, locals)
          ? this.draw(node.thenBranch, locals)
          : this.draw(node.elseBranch, locals);
      case "and": {
        // JavaScript's `&&` yields its left operand when that is falsy, and
        // React writes a `0` from it; `null`, `false` and `""` draw nothing.
        const condition = this.evaluate(node.condition, locals);
        return condition ? this.draw(node.body, locals) : condition;
      }
      case "map": {
        const target = this.evaluate(node.target, locals);
        if (!Array.isArray(target)) {
          throw new HirInterpretError(
            "`.map(...)` is only available on arrays.",
            node.target.span,
          );
        }
        return target.map((item, index) => {
          const scoped = new Map(locals);
          scoped.set(node.param.name, item);
          if (node.indexParam) {
            scoped.set(node.indexParam.name, index);
          }
          return this.draw(node.body, scoped);
        });
      }
      case "let": {
        const scoped = new Map(locals);
        for (const binding of node.bindings) {
          scoped.set(binding.name, this.evaluate(binding.value, scoped));
        }
        return this.draw(node.body, scoped);
      }
    }
  }
}

/**
 * Draws one frame: evaluates a lowered (and, at the caller's responsibility,
 * checked) visualizer over what it draws, a place's tokens or a net's
 * places, and the net's parameters. Throws `HirInterpretError`, positioned
 * in the user source, on evaluation failure.
 */
export function interpretViewHir(view: ViewHir, props: ViewProps): ViewValue {
  const locals = new Map<string, HirValue>();
  if (view.props) {
    locals.set(view.props.name, {
      width: props.width,
      height: props.height,
      ...("places" in props
        ? { places: props.places }
        : { tokens: props.tokens as HirValue }),
      parameters: props.parameters as HirValue,
    });
  }
  return new ViewInterpreter(props.parameters).draw(view.body, locals);
}
