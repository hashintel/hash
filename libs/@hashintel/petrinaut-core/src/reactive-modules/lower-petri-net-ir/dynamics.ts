import {
  assign,
  binary,
  ite,
  type ReactiveStatement,
  ref,
} from "../reactive-module-graph";
import { BindingRefusal } from "./bindings";
import { type PlaceLayout, slotToken } from "./colour-layout";
import {
  type LinearHirEnv,
  LinearHirRefusal,
  scaled,
  type TokenBinding,
  type Translated,
  translateValue,
} from "./linear-hir";
import { attributeName, presentName } from "./shared/names";

import type { HirExpr, HirFunction } from "../../hir/hir";

/**
 * A place's dynamics as one Euler step per slot, before the sweep, as the
 * engine takes it: `x += f(x) * dt` on every real attribute of every
 * present token. The equation's body is `tokens.map((token) => ({ attr:
 * derivative, ... }))`; a missing attribute has a zero derivative.
 */

const refuse = (code: string, message: string): never => {
  throw new BindingRefusal(code, message);
};

export const lowerDynamics = (
  layout: PlaceLayout,
  fn: HirFunction,
  dt: number,
): ReactiveStatement[] => {
  const inputName = fn.params[0]?.name ?? "tokens";
  let body = fn.body;
  const rootLocals = new Map<string, Translated | TokenBinding>();
  const env: LinearHirEnv = {
    inputName,
    token: () => undefined,
    tokenCount: () => undefined,
  };
  while (body.kind === "let") {
    for (const binding of body.bindings) {
      try {
        rootLocals.set(
          binding.name,
          translateValue(binding.value, env, rootLocals),
        );
      } catch (error) {
        if (error instanceof LinearHirRefusal) {
          return refuse(error.code, `In the dynamics, ${error.message}`);
        }
        throw error;
      }
    }
    body = body.body;
  }
  if (
    body.kind !== "arrayMap" ||
    body.target.kind !== "localRef" ||
    body.target.name !== inputName
  ) {
    return refuse(
      "dynamics-shape",
      "dynamics map the tokens to a record of derivatives",
    );
  }
  // The callback may bind consts before its record.
  let callback = body.body;
  const callbackBindings: { name: string; value: HirExpr }[] = [];
  while (callback.kind === "let") {
    callbackBindings.push(...callback.bindings);
    callback = callback.body;
  }
  if (callback.kind !== "recordLit") {
    return refuse(
      "dynamics-shape",
      "dynamics map the tokens to a record of derivatives",
    );
  }
  const record = callback;
  const statements: ReactiveStatement[] = [];
  for (let slot = 0; slot < layout.slots; slot++) {
    const locals = new Map(rootLocals);
    locals.set(body.param.name, slotToken(layout, slot));
    for (const binding of callbackBindings) {
      try {
        locals.set(binding.name, translateValue(binding.value, env, locals));
      } catch (error) {
        if (error instanceof LinearHirRefusal) {
          return refuse(error.code, `In the dynamics, ${error.message}`);
        }
        throw error;
      }
    }
    for (const attribute of layout.attributes) {
      if (!attribute.integrates) {
        continue;
      }
      const entry = record.entries.find(
        (candidate) => candidate.key === attribute.name,
      );
      if (entry === undefined) {
        continue;
      }
      let derivative: Translated;
      try {
        derivative = translateValue(entry.value, env, locals);
      } catch (error) {
        if (error instanceof LinearHirRefusal) {
          return refuse(error.code, `In the dynamics, ${error.message}`);
        }
        throw error;
      }
      if (derivative.sort !== "number") {
        return refuse(
          "sort-mismatch",
          `the derivative of ${attribute.name} is not a number`,
        );
      }
      if (derivative.expr.kind === "num" && derivative.expr.value === 0) {
        // A zero derivative moves nothing.
        continue;
      }
      const variable = attributeName(layout.place, slot, attribute.name);
      statements.push(
        assign(
          variable,
          ite(
            ref(presentName(layout.place, slot)),
            binary("+", ref(variable), scaled(dt, derivative.expr)),
            ref(variable),
          ),
          slot === 0
            ? `${layout.place}: one Euler step of dt = ${dt}`
            : undefined,
        ),
      );
    }
  }
  return statements;
};
