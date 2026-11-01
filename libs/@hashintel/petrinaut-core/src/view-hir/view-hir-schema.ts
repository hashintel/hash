/**
 * Runtime schema for the view HIR that `view-hir.ts` declares as types,
 * kept in lockstep by the `Equals` assertions at the bottom: a node kind or
 * field added to `view-hir.ts` without a mirror here fails to compile, which
 * is what guarantees every node is JSON-serializable across the worker
 * boundary.
 */
import { z } from "zod";

import {
  hirExprSchema,
  letBindingSchema,
  namedSpanSchema,
  spanSchema,
} from "../hir/hir-schema";

import type {
  ViewAnd,
  ViewAttribute,
  ViewCond,
  ViewElement,
  ViewEmpty,
  ViewExpr,
  ViewHir,
  ViewLet,
  ViewMap,
  ViewNode,
  ViewText,
} from "./view-hir";

const nodeBase = { span: spanSchema };

/** The view grammar; `z.lazy` breaks the recursion through children. */
export const viewNodeSchema: z.ZodType<ViewNode> = z
  // eslint-disable-next-line no-use-before-define -- recursive grammar: the node schemas below reference this union, and it is built from them once they exist
  .lazy(() => z.discriminatedUnion("kind", viewNodeOptions))
  .meta({
    id: "ViewNode",
    description:
      "One view HIR node, discriminated by `kind`. Renderers must reject kinds they do not know.",
  });

const attributeSchema = z
  .strictObject({
    name: z.string(),
    nameSpan: spanSchema,
    value: hirExprSchema,
  })
  .meta({ id: "ViewAttribute" });

const elementSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("element"),
    tag: z.string(),
    tagSpan: spanSchema,
    attributes: z.array(attributeSchema),
    key: hirExprSchema.optional(),
    children: z.array(viewNodeSchema),
  })
  .meta({ id: "ViewElement" });

const textSchema = z
  .strictObject({ ...nodeBase, kind: z.literal("text"), value: z.string() })
  .meta({ id: "ViewText" });

const exprSchema = z
  .strictObject({ ...nodeBase, kind: z.literal("expr"), expr: hirExprSchema })
  .meta({ id: "ViewExpr" });

const emptySchema = z
  .strictObject({ ...nodeBase, kind: z.literal("empty") })
  .meta({ id: "ViewEmpty" });

const condSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("cond"),
    condition: hirExprSchema,
    thenBranch: viewNodeSchema,
    elseBranch: viewNodeSchema,
  })
  .meta({ id: "ViewCond" });

const andSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("and"),
    condition: hirExprSchema,
    body: viewNodeSchema,
  })
  .meta({ id: "ViewAnd" });

const mapSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("map"),
    target: hirExprSchema,
    param: namedSpanSchema,
    indexParam: namedSpanSchema.optional(),
    body: viewNodeSchema,
  })
  .meta({ id: "ViewMap" });

const letSchema = z
  .strictObject({
    ...nodeBase,
    kind: z.literal("let"),
    bindings: z.array(letBindingSchema),
    body: viewNodeSchema,
  })
  .meta({ id: "ViewLet" });

const viewNodeOptions = [
  elementSchema,
  textSchema,
  exprSchema,
  emptySchema,
  condSchema,
  andSchema,
  mapSchema,
  letSchema,
] as const;

/** A lowered visualizer, as it crosses the worker boundary. */
export const viewHirSchema = z
  .strictObject({
    viewVersion: z.literal(1),
    props: namedSpanSchema.nullable(),
    body: viewNodeSchema,
    span: spanSchema,
  })
  .meta({
    id: "ViewHir",
    description:
      "A lowered place visualizer (see view-hir/view-hir.ts for the grammar). Expressions inside it follow the HIR expression grammar.",
  });

// -- Lockstep with view-hir.ts ------------------------------------------------

type Equals<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? [keyof A] extends [keyof B]
      ? [keyof B] extends [keyof A]
        ? true
        : false
      : false
    : false
  : false;

type Assertions = [
  Equals<z.output<typeof attributeSchema>, ViewAttribute>,
  Equals<z.output<typeof elementSchema>, ViewElement>,
  Equals<z.output<typeof textSchema>, ViewText>,
  Equals<z.output<typeof exprSchema>, ViewExpr>,
  Equals<z.output<typeof emptySchema>, ViewEmpty>,
  Equals<z.output<typeof condSchema>, ViewCond>,
  Equals<z.output<typeof andSchema>, ViewAnd>,
  Equals<z.output<typeof mapSchema>, ViewMap>,
  Equals<z.output<typeof letSchema>, ViewLet>,
  Equals<z.output<typeof viewNodeSchema>, ViewNode>,
  Equals<z.output<typeof viewHirSchema>, ViewHir>,
];

const assertions: Assertions = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];
void assertions;
