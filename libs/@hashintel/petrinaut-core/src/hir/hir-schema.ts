/**
 * Runtime schema for the serialized HIR grammar that `hir.ts` declares as
 * types. Anything that carries HIR across a process boundary (an
 * optimization manifest, the CLI's describe protocol) validates it here, and
 * the CLI publishes this schema as JSON Schema so other languages generate a
 * matching, fully typed AST from the one definition.
 *
 * The schema and the types are kept in lockstep by the `Equals` assertions
 * at the bottom of this file: adding a node kind or a field to `hir.ts`
 * without mirroring it here fails to compile.
 */

import { z } from "zod";

import { HIR_MATH_FNS, HIR_STRING_FNS } from "./hir";

import type {
  HirArrayConcat,
  HirArrayLit,
  HirArrayMap,
  HirArrayReduce,
  HirBinary,
  HirBoolLit,
  HirCond,
  HirConstant,
  HirDistribution,
  HirDistributionMap,
  HirExpr,
  HirFieldAccess,
  HirFunction,
  HirIndexAccess,
  HirLength,
  HirLet,
  HirLocalRef,
  HirMathCall,
  HirNumberLit,
  HirParamRef,
  HirRangeCall,
  HirRecordLit,
  HirScenarioRef,
  HirStringCall,
  HirStringLit,
  HirUnary,
  HirUuidFrom,
  HirUuidGenerate,
  Span,
} from "./hir";

export const spanSchema = z
  .strictObject({
    start: z.int().nonnegative(),
    length: z.int().nonnegative(),
  })
  .meta({
    id: "HirSpan",
    description:
      "Half-open span into the user-visible source text, in UTF-16 code units.",
  });

const namedSpanSchema = z
  .strictObject({
    name: z.string(),
    span: spanSchema,
  })
  .meta({
    id: "HirNamedSpan",
    description:
      "A declared name (a parameter or a binding) and where it is spelled.",
  });

export const hirStringFnSchema = z
  .enum(HIR_STRING_FNS)
  .meta({ id: "HirStringFn" });
export const hirMathFnSchema = z.enum(HIR_MATH_FNS).meta({ id: "HirMathFn" });
export const hirConstantNameSchema = z
  .enum(["PI", "E", "Infinity", "NaN"])
  .meta({ id: "HirConstantName" });
export const hirUnaryOpSchema = z
  .enum(["-", "+", "!"])
  .meta({ id: "HirUnaryOp" });
export const hirBinaryOpSchema = z
  .enum([
    "+",
    "-",
    "*",
    "/",
    "%",
    "**",
    "<",
    "<=",
    ">",
    ">=",
    "==",
    "!=",
    "&&",
    "||",
  ])
  .meta({ id: "HirBinaryOp" });
export const hirDistributionKindSchema = z
  .enum(["gaussian", "uniform", "lognormal"])
  .meta({ id: "HirDistributionKind" });

const nodeBase = {
  id: z.int().nonnegative(),
  span: spanSchema,
};

/**
 * The expression grammar. `z.lazy` breaks the recursion; the annotation
 * pins the inferred output to `HirExpr` so every node schema below can
 * reference it without widening.
 */
export const hirExprSchema: z.ZodType<HirExpr> = z
  // eslint-disable-next-line no-use-before-define -- recursive grammar: the node schemas below reference this union, and it is built from them once they exist
  .lazy(() => z.discriminatedUnion("kind", hirExprOptions))
  .meta({
    id: "HirExpr",
    description:
      "One HIR expression node, discriminated by `kind`. Evaluators must reject kinds they do not know.",
  });

const numberLitSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("numberLit"),
    value: z.number(),
    raw: z.string(),
  })
  .meta({ id: "HirNumberLit" });

const boolLitSchema = z
  .strictObject({ ...nodeBase, kind: z.literal("boolLit"), value: z.boolean() })
  .meta({ id: "HirBoolLit" });

const stringLitSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("stringLit"),
    value: z.string(),
  })
  .meta({ id: "HirStringLit" });

const stringCallSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("stringCall"),
    fn: hirStringFnSchema,
    target: hirExprSchema,
    argument: hirExprSchema,
  })
  .meta({ id: "HirStringCall" });

const uuidGenerateSchema = z
  .strictObject({ ...nodeBase, kind: z.literal("uuidGenerate") })
  .meta({ id: "HirUuidGenerate" });

const uuidFromSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("uuidFrom"),
    operand: hirExprSchema,
  })
  .meta({ id: "HirUuidFrom" });

const constantSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("constant"),
    name: hirConstantNameSchema,
  })
  .meta({ id: "HirConstant" });

const localRefSchema = z
  .strictObject({ ...nodeBase, kind: z.literal("localRef"), name: z.string() })
  .meta({ id: "HirLocalRef" });

const paramRefSchema = z
  .strictObject({ ...nodeBase, kind: z.literal("paramRef"), name: z.string() })
  .meta({ id: "HirParamRef" });

const scenarioRefSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("scenarioRef"),
    name: z.string(),
  })
  .meta({ id: "HirScenarioRef" });

const rangeCallSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("rangeCall"),
    args: z.array(hirExprSchema),
  })
  .meta({ id: "HirRangeCall" });

const fieldAccessSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("fieldAccess"),
    target: hirExprSchema,
    field: z.string(),
    fieldSpan: spanSchema,
  })
  .meta({ id: "HirFieldAccess" });

const indexAccessSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("indexAccess"),
    target: hirExprSchema,
    index: hirExprSchema,
  })
  .meta({ id: "HirIndexAccess" });

const lengthSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("length"),
    target: hirExprSchema,
  })
  .meta({ id: "HirLength" });

const unarySchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("unary"),
    op: hirUnaryOpSchema,
    operand: hirExprSchema,
  })
  .meta({ id: "HirUnary" });

const binarySchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("binary"),
    op: hirBinaryOpSchema,
    left: hirExprSchema,
    right: hirExprSchema,
  })
  .meta({ id: "HirBinary" });

const condSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("cond"),
    condition: hirExprSchema,
    thenBranch: hirExprSchema,
    elseBranch: hirExprSchema,
  })
  .meta({ id: "HirCond" });

const letBindingSchema = z
  .strictObject({
    name: z.string(),
    nameSpan: spanSchema,
    value: hirExprSchema,
  })
  .meta({ id: "HirLetBinding" });

const letSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("let"),
    bindings: z.array(letBindingSchema),
    body: hirExprSchema,
  })
  .meta({ id: "HirLet" });

const mathCallSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("mathCall"),
    fn: hirMathFnSchema,
    args: z.array(hirExprSchema),
  })
  .meta({ id: "HirMathCall" });

const recordEntrySchema = z
  .strictObject({
    key: z.string(),
    keySpan: spanSchema,
    value: hirExprSchema,
  })
  .meta({ id: "HirRecordEntry" });

const recordLitSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("recordLit"),
    entries: z.array(recordEntrySchema),
  })
  .meta({ id: "HirRecordLit" });

const arrayLitSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("arrayLit"),
    elements: z.array(hirExprSchema),
  })
  .meta({ id: "HirArrayLit" });

const arrayMapSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("arrayMap"),
    target: hirExprSchema,
    param: namedSpanSchema,
    indexParam: namedSpanSchema.optional(),
    body: hirExprSchema,
  })
  .meta({ id: "HirArrayMap" });

const arrayReduceSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("arrayReduce"),
    target: hirExprSchema,
    accParam: namedSpanSchema,
    param: namedSpanSchema,
    indexParam: namedSpanSchema.optional(),
    body: hirExprSchema,
    initial: hirExprSchema,
  })
  .meta({ id: "HirArrayReduce" });

const arrayConcatSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("arrayConcat"),
    left: hirExprSchema,
    right: hirExprSchema,
  })
  .meta({ id: "HirArrayConcat" });

const distributionSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("distribution"),
    dist: hirDistributionKindSchema,
    args: z.array(hirExprSchema),
  })
  .meta({ id: "HirDistribution" });

const distributionMapSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("distributionMap"),
    base: hirExprSchema,
    param: namedSpanSchema,
    body: hirExprSchema,
  })
  .meta({ id: "HirDistributionMap" });

/** One schema per `HirExpr` member; the union above is built from this. */
const hirExprOptions = [
  numberLitSchema,
  boolLitSchema,
  stringLitSchema,
  stringCallSchema,
  uuidGenerateSchema,
  uuidFromSchema,
  constantSchema,
  localRefSchema,
  paramRefSchema,
  scenarioRefSchema,
  rangeCallSchema,
  fieldAccessSchema,
  indexAccessSchema,
  lengthSchema,
  unarySchema,
  binarySchema,
  condSchema,
  letSchema,
  mathCallSchema,
  recordLitSchema,
  arrayLitSchema,
  arrayMapSchema,
  arrayReduceSchema,
  arrayConcatSchema,
  distributionSchema,
  distributionMapSchema,
] as const;

export const hirSurfaceKindSchema = z
  .enum([
    "dynamics",
    "lambda",
    "kernel",
    "metric",
    "scenario-expression",
    "scenario-code",
  ])
  .meta({ id: "HirSurfaceKind" });

/** A lowered user function: the unit that crosses process boundaries. */
export const hirFunctionSchema = z
  .strictObject({
    hirVersion: z.literal(1),
    surface: hirSurfaceKindSchema,
    params: z.array(namedSpanSchema),
    body: hirExprSchema,
    span: spanSchema,
  })
  .meta({
    id: "HirFunction",
    description:
      "A lowered user function (see hir/hir.ts for the grammar). `params[0]` is the input parameter when the surface declares one; `parameters.*` and `scenario.*` reads are dedicated node kinds, never locals.",
  });

// -- Lockstep with hir.ts -----------------------------------------------------
//
// Each assertion fails to compile when the schema's output type and the
// declared type diverge in either direction, so a new field or node kind in
// `hir.ts` has to be mirrored above before the package builds.

/**
 * The schema output and the declared type coincide: mutually assignable and
 * with the same keys. Assignability alone would let an optional field go
 * missing on either side unnoticed.
 */
type Equals<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? [keyof A] extends [keyof B]
      ? [keyof B] extends [keyof A]
        ? true
        : false
      : false
    : false
  : false;

type SchemaKind = z.output<(typeof hirExprOptions)[number]>["kind"];

type _Lockstep = [
  Equals<z.output<typeof spanSchema>, Span>,
  Equals<z.output<typeof numberLitSchema>, HirNumberLit>,
  Equals<z.output<typeof boolLitSchema>, HirBoolLit>,
  Equals<z.output<typeof stringLitSchema>, HirStringLit>,
  Equals<z.output<typeof stringCallSchema>, HirStringCall>,
  Equals<z.output<typeof uuidGenerateSchema>, HirUuidGenerate>,
  Equals<z.output<typeof uuidFromSchema>, HirUuidFrom>,
  Equals<z.output<typeof constantSchema>, HirConstant>,
  Equals<z.output<typeof localRefSchema>, HirLocalRef>,
  Equals<z.output<typeof paramRefSchema>, HirParamRef>,
  Equals<z.output<typeof scenarioRefSchema>, HirScenarioRef>,
  Equals<z.output<typeof rangeCallSchema>, HirRangeCall>,
  Equals<z.output<typeof fieldAccessSchema>, HirFieldAccess>,
  Equals<z.output<typeof indexAccessSchema>, HirIndexAccess>,
  Equals<z.output<typeof lengthSchema>, HirLength>,
  Equals<z.output<typeof unarySchema>, HirUnary>,
  Equals<z.output<typeof binarySchema>, HirBinary>,
  Equals<z.output<typeof condSchema>, HirCond>,
  Equals<z.output<typeof letSchema>, HirLet>,
  Equals<z.output<typeof mathCallSchema>, HirMathCall>,
  Equals<z.output<typeof recordLitSchema>, HirRecordLit>,
  Equals<z.output<typeof arrayLitSchema>, HirArrayLit>,
  Equals<z.output<typeof arrayMapSchema>, HirArrayMap>,
  Equals<z.output<typeof arrayReduceSchema>, HirArrayReduce>,
  Equals<z.output<typeof arrayConcatSchema>, HirArrayConcat>,
  Equals<z.output<typeof distributionSchema>, HirDistribution>,
  Equals<z.output<typeof distributionMapSchema>, HirDistributionMap>,
  Equals<z.output<typeof hirFunctionSchema>, HirFunction>,
  // Every declared kind has a schema in the union above, and nothing more.
  Equals<SchemaKind, HirExpr["kind"]>,
];

const lockstep: _Lockstep extends true[] ? true : never = true;
void lockstep;
