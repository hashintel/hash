import {
  constant,
  integer,
  name,
  section,
  unsigned,
  vector,
} from "./emit-module/binary";

import type { HirExpr, HirFunction } from "../hir/hir";

type Value = { code: number[]; kind: "number" | "boolean" };

export type WasmProgram = {
  parameters: readonly { variableName: string; type: string }[];
  places: readonly { name: string }[];
  lambdas: readonly { hir: HirFunction; predicate: boolean }[];
  metrics: readonly HirFunction[];
};

export class WasmUnsupportedError extends Error {}

const truthy = (value: Value): number[] => [
  ...value.code,
  ...constant(0),
  0x62,
  ...value.code,
  ...value.code,
  0x61,
  0x71,
];

const fieldPath = (expr: HirExpr): string[] | null => {
  if (expr.kind === "localRef") {
    return [expr.name];
  }
  if (expr.kind === "fieldAccess") {
    const parent = fieldPath(expr.target);
    return parent === null ? null : [...parent, expr.field];
  }
  return null;
};

const makeEmitter = (
  program: WasmProgram,
  bufferParameter: number,
  firstLocal: number,
  metricRoot?: string,
) => {
  let localCount = 0;
  const load = (index: number): number[] => [
    0x20,
    ...unsigned(bufferParameter),
    0x2b,
    3,
    ...unsigned(index * 8),
  ];
  const emit = (expr: HirExpr, locals = new Map<string, Value>()): Value => {
    const numeric = (code: number[]): Value => ({ code, kind: "number" });
    const boolean = (code: number[]): Value => ({
      code: [...code, 0xb7],
      kind: "boolean",
    });
    switch (expr.kind) {
      case "numberLit":
        return numeric(constant(expr.value));
      case "boolLit":
        return { code: constant(expr.value ? 1 : 0), kind: "boolean" };
      case "constant":
        return numeric(
          constant({ PI: Math.PI, E: Math.E, Infinity, NaN }[expr.name]),
        );
      case "localRef": {
        const value = locals.get(expr.name);
        if (value) {
          return value;
        }
        break;
      }
      case "paramRef": {
        const index = program.parameters.findIndex(
          (parameter) => parameter.variableName === expr.name,
        );
        if (index >= 0) {
          return {
            code: load(index),
            kind:
              program.parameters[index]!.type === "boolean"
                ? "boolean"
                : "number",
          };
        }
        break;
      }
      case "fieldAccess": {
        const path = fieldPath(expr);
        if (
          path?.length === 4 &&
          path[0] === metricRoot &&
          path[1] === "places" &&
          path[3] === "count"
        ) {
          const index = program.places.findIndex(
            (place) => place.name === path[2],
          );
          if (index >= 0) {
            return numeric(load(program.parameters.length + index));
          }
        }
        break;
      }
      case "unary": {
        const value = emit(expr.operand, locals);
        if (expr.op === "!") {
          return boolean([...truthy(value), 0x45]);
        }
        return numeric([...value.code, ...(expr.op === "-" ? [0x9a] : [])]);
      }
      case "binary": {
        const left = emit(expr.left, locals);
        const right = emit(expr.right, locals);
        if (expr.op === "&&" || expr.op === "||") {
          if (left.kind !== right.kind) {
            throw new WasmUnsupportedError(
              "Wasm logical operands must have the same scalar type.",
            );
          }
          return {
            kind: right.kind,
            code: [
              ...truthy(left),
              0x04,
              0x7c,
              ...(expr.op === "&&" ? right.code : left.code),
              0x05,
              ...(expr.op === "&&" ? left.code : right.code),
              0x0b,
            ],
          };
        }
        const arithmetic = { "+": 0xa0, "-": 0xa1, "*": 0xa2, "/": 0xa3 };
        if (expr.op in arithmetic) {
          return numeric([
            ...left.code,
            ...right.code,
            arithmetic[expr.op as keyof typeof arithmetic],
          ]);
        }
        const comparisons = {
          "==": 0x61,
          "!=": 0x62,
          "<": 0x63,
          ">": 0x64,
          "<=": 0x65,
          ">=": 0x66,
        };
        if (expr.op in comparisons) {
          if (
            (expr.op === "==" || expr.op === "!=") &&
            left.kind !== right.kind
          ) {
            return {
              kind: "boolean",
              code: constant(expr.op === "==" ? 0 : 1),
            };
          }
          return boolean([
            ...left.code,
            ...right.code,
            comparisons[expr.op as keyof typeof comparisons],
          ]);
        }
        break;
      }
      case "cond": {
        const condition = emit(expr.condition, locals);
        const then = emit(expr.thenBranch, locals);
        const otherwise = emit(expr.elseBranch, locals);
        if (then.kind !== otherwise.kind) {
          throw new WasmUnsupportedError(
            "Wasm conditional branches must have the same scalar type.",
          );
        }
        return {
          kind: then.kind,
          code: [
            ...truthy(condition),
            0x04,
            0x7c,
            ...then.code,
            0x05,
            ...otherwise.code,
            0x0b,
          ],
        };
      }
      case "let": {
        const scope = new Map(locals);
        const code: number[] = [];
        for (const binding of expr.bindings) {
          const value = emit(binding.value, scope);
          const local = firstLocal + localCount++;
          code.push(...value.code, 0x21, ...unsigned(local));
          scope.set(binding.name, {
            kind: value.kind,
            code: [0x20, ...unsigned(local)],
          });
        }
        const body = emit(expr.body, scope);
        return { kind: body.kind, code: [...code, ...body.code] };
      }
      case "mathCall": {
        const unary = {
          abs: 0x99,
          ceil: 0x9b,
          floor: 0x9c,
          trunc: 0x9d,
          sqrt: 0x9f,
        };
        if (expr.fn in unary && expr.args.length === 1) {
          return numeric([
            ...emit(expr.args[0]!, locals).code,
            unary[expr.fn as keyof typeof unary],
          ]);
        }
        if (expr.fn === "min" || expr.fn === "max") {
          const code = constant(expr.fn === "min" ? Infinity : -Infinity);
          for (const argument of expr.args) {
            code.push(
              ...emit(argument, locals).code,
              expr.fn === "min" ? 0xa4 : 0xa5,
            );
          }
          return numeric(code);
        }
        break;
      }
      default:
        break;
    }
    throw new WasmUnsupportedError(
      `Wasm compilation does not support ${expr.kind}${"fn" in expr ? ` (${expr.fn})` : "op" in expr ? ` (${expr.op})` : ""}.`,
    );
  };
  return { emit, getLocalCount: () => localCount };
};

export const emitWasmModule = (
  program: WasmProgram,
): Uint8Array<ArrayBuffer> => {
  const type = (parameters: number[], results: number[]): number[] => [
    0x60,
    ...vector(parameters.map((value) => [value])),
    ...vector(results.map((value) => [value])),
  ];
  const types = [
    type([0x7f], [0x7f]),
    type([0x7f, 0x7f, 0x7c], []),
    type([0x7f], []),
    type([0x7f, 0x7f], [0x7f]),
    type([0x7f], [0x7c]),
  ];
  const imports = [
    [...name("runtime"), ...name("simulation_begin"), 0, 0],
    [...name("runtime"), ...name("simulation_fire"), 0, 1],
    [...name("runtime"), ...name("simulation_finish"), 0, 2],
    [...name("runtime"), ...name("memory"), 2, 0, 0],
  ];
  const emitter = makeEmitter(program, 1, 2);
  const advance = [0x20, 0, 0x10, 0, 0x04, 0x7f];
  for (const [index, lambda] of program.lambdas.entries()) {
    const value = emitter.emit(lambda.hir.body);
    const rate = lambda.predicate
      ? [
          ...truthy(value),
          0x04,
          0x7c,
          ...constant(Infinity),
          0x05,
          ...constant(0),
          0x0b,
        ]
      : value.code;
    advance.push(0x20, 0, ...integer(index), ...rate, 0x10, 1);
  }
  advance.push(
    0x20,
    0,
    0x10,
    2,
    ...integer(1),
    0x05,
    ...integer(0),
    0x0b,
    0x0b,
  );
  const body = (code: number[], locals: number): number[] => {
    const bytes = [
      ...(locals === 0 ? [0] : [1, ...unsigned(locals), 0x7c]),
      ...code,
    ];
    return [...unsigned(bytes.length), ...bytes];
  };
  const bodies = [body(advance, emitter.getLocalCount())];
  const exports = [[...name("advance"), 0, 3]];
  for (const [index, metric] of program.metrics.entries()) {
    const metricEmitter = makeEmitter(
      program,
      0,
      1,
      metric.params[0]?.name ?? "state",
    );
    const value = metricEmitter.emit(metric.body);
    bodies.push(body([...value.code, 0x0b], metricEmitter.getLocalCount()));
    exports.push([...name(`metric${index}`), 0, ...unsigned(index + 4)]);
  }
  return new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    ...section(1, vector(types)),
    ...section(2, vector(imports)),
    ...section(3, vector([[3], ...program.metrics.map(() => [4])])),
    ...section(7, vector(exports)),
    ...section(10, vector(bodies)),
  ]);
};
