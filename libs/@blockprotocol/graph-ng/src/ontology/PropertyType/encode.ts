import { AST } from "@effect/schema";
import {
  Option,
  Either,
  pipe,
  Stream,
  Effect,
  Chunk,
  ReadonlyArray,
  Equivalence,
  Predicate,
  ReadonlyRecord,
} from "effect";

import * as EncodeContext from "../internal/EncodeContext.js";
import * as PropertyType from "../PropertyType.js";
import { EncodeError } from "./error.js";
import {
  ArrayOfPropertyValues,
  DataTypeReference,
  PropertyTypeSchema,
  PropertyValues,
  Array,
  PropertyTypeReference,
  PropertyTypeObjectValue,
  OneOf,
  PropertyTypeObject,
  makeBase,
} from "./schema.js";
import * as DataType from "../DataType.js";
import { asNumberOrUndefined } from "../internal/encode.js";
import * as VersionedUrl from "../../VersionedUrl.js";

type Context = EncodeContext.EncodeContext<PropertyType.PropertyType<unknown>>;

type PreparedAST = Exclude<
  AST.AST,
  AST.Refinement | AST.Suspend | AST.Transformation
>;

// TODO: test
const flattenedUnionStream = (
  types: readonly AST.AST[],
  currentContext: Context,
): Stream.Stream<Exclude<AST.AST, AST.Union>, EncodeError> =>
  pipe(
    Stream.make(...types),
    Stream.mapEffect((node) =>
      Effect.gen(function* (_) {
        if (!AST.isUnion(node)) {
          return Stream.make(node);
        }

        const context = yield* _(
          EncodeContext.visit(node, currentContext),
          Either.mapLeft(EncodeError.visit),
        );

        return flattenedUnionStream(node.types, context);
      }),
    ),
    Stream.flatten(),
  );

const flattenUnion = (
  ast: AST.Union,
  currentContext: Context,
): Effect.Effect<AST.AST, EncodeError> =>
  Effect.gen(function* (_) {
    const children = yield* _(
      flattenedUnionStream(ast.types, currentContext),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
    );

    return AST.Union.make(children, ast.annotations);
  });

const prepare = (
  ast: AST.AST,
  parentContext: Context,
): Effect.Effect<{ node: PreparedAST; context: Context }, EncodeError> =>
  Effect.gen(function* (_) {
    const context = yield* _(
      EncodeContext.visit(ast, parentContext),
      Effect.mapError(EncodeError.visit),
    );

    switch (ast._tag) {
      case "UndefinedKeyword":
      case "Declaration":
      case "Literal":
      case "UniqueSymbol":
      case "VoidKeyword":
      case "NeverKeyword":
      case "UnknownKeyword":
      case "AnyKeyword":
      case "StringKeyword":
      case "NumberKeyword":
      case "BooleanKeyword":
      case "BigIntKeyword":
      case "SymbolKeyword":
      case "ObjectKeyword":
      case "Enums":
      case "TemplateLiteral":
        return { node: ast, context };
      case "Refinement":
        return yield* _(prepare(ast.from, context));
      case "TupleType":
      case "TypeLiteral":
        return { node: ast, context };
      case "Union":
        return yield* _(
          flattenUnion(ast, context),
          Effect.andThen((ast) => prepare(ast, context)),
        );
      case "Suspend":
        return yield* _(prepare(ast.f(), context));
      case "Transformation":
        return yield* _(prepare(ast.from, context));
    }
  });

type MapFn<T> = (
  ast: AST.AST,
  context: Context,
) => Effect.Effect<T, EncodeError>;

const encodeOneOf = <T>(ast: AST.AST, parentContext: Context, map: MapFn<T>) =>
  Effect.gen(function* (_) {
    const { node, context } = yield* _(prepare(ast, parentContext));

    // create a stream of nodes, each of invokes the provided function
    // if not union we assume it's just a single element;
    const stream = AST.isUnion(node)
      ? Stream.make(...node.types)
      : Stream.make(node);

    return yield* _(
      stream,
      Stream.mapEffect((node) => prepare(node, context)),
      Stream.mapEffect(({ node, context }) => map(node, context)),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
    );
  });

const encodeDataTypeReference = (
  dataType: DataType.DataType<unknown>,
): DataTypeReference => ({
  $ref: dataType.id,
});

const encodePropertyTypeReference = (
  propertyType: PropertyType.PropertyType<unknown>,
): PropertyTypeReference => ({
  $ref: propertyType.id,
});

type ChildFn<T> = (
  node: AST.AST,
  context: Context,
) => Effect.Effect<T, EncodeError>;

const encodeArray = <T>(
  child: AST.AST,
  parentContext: Context,
  {
    minItems: minItemsOverride,
    maxItems: maxItemsOverride,
  }: { minItems: Option.Option<number>; maxItems: Option.Option<number> },
  encode: ChildFn<T>,
): Effect.Effect<Array<T>, EncodeError> =>
  Effect.gen(function* (_) {
    const minItemsDefault = yield* _(
      asNumberOrUndefined(parentContext.jsonSchema.additional, "minItems"),
      Effect.mapError(EncodeError.jsonSchema),
    );

    const minItems = Option.getOrElse(minItemsOverride, () => minItemsDefault);

    const maxItemsDefault = yield* _(
      asNumberOrUndefined(parentContext.jsonSchema.additional, "maxItems"),
      Effect.mapError(EncodeError.jsonSchema),
    );

    const maxItems = Option.getOrElse(maxItemsOverride, () => maxItemsDefault);

    const { node, context } = yield* _(prepare(child, parentContext));
    const items = yield* _(encode(node, context));

    const schema = {
      type: "array",
      items,
    } as Array<T>;

    if (minItems !== undefined) {
      schema.minItems = minItems;
    }

    if (maxItems !== undefined) {
      schema.maxItems = maxItems;
    }

    return schema;
  });

const encodeArrayOfPropertyValues = (
  ast: AST.AST,
  parentContext: Context,
  {
    minItems: minItemsOverride,
    maxItems: maxItemsOverride,
  }: { minItems: Option.Option<number>; maxItems: Option.Option<number> },
): Effect.Effect<ArrayOfPropertyValues, EncodeError> =>
  Effect.gen(function* (_) {
    return yield* _(
      encodeArray(
        ast,
        parentContext,
        { minItems: minItemsOverride, maxItems: maxItemsOverride },
        (node, context) =>
          pipe(
            encodeOneOf(node, context, encodePropertyValues),
            Effect.map((oneOf) => ({ oneOf })),
          ),
      ),
    );
  });

const arrayChildNode = (
  node: AST.AST,
): Effect.Effect<
  Option.Option<{
    child: AST.AST;
    minItems: Option.Option<number>;
    maxItems: Option.Option<number>;
  }>
> =>
  Effect.gen(function* (_) {
    if (!AST.isTupleType(node)) {
      return Option.none();
    }

    // if we have the same elements in a tuple that can be used as a fixed sized array
    const elements = node.elements;
    const rest = node.rest;

    if (elements.length !== 0 && rest.length !== 0) {
      // TODO: needs test
      throw new Error("elements and rest at the same time are not supported");
    }

    if (rest.length > 1) {
      // TODO: needs test
      throw new Error("rest with trailing elements is not supported");
    }

    if (elements.length > 0) {
      // any optional elements are not allowed
      if (elements.some((element) => element.isOptional)) {
        throw new Error("optional elements are not allowed");
      }

      // see if the elements are all the same
      const areEqual = pipe(
        elements,
        ReadonlyArray.map((element) => element.type),
        ReadonlyArray.map(AST.hash),
        ReadonlyArray.every(Equivalence.number),
      );

      if (!areEqual) {
        // TODO: needs test
        throw new Error("tuple elements need to be the same");
      }

      return Option.some({
        child: elements[0].type,
        minItems: Option.some(elements.length),
        maxItems: Option.some(elements.length),
      });
    }

    return Option.some({
      child: rest[0],
      minItems: Option.none(),
      maxItems: Option.none(),
    });
  });

const encodePropertyTypeObjectValue = (
  ast: AST.AST,
  context: Context,
): Effect.Effect<PropertyTypeObjectValue, EncodeError> =>
  Effect.gen(function* (_) {
    const arrayType = yield* _(arrayChildNode(ast));
    if (Option.isSome(arrayType)) {
      const { child, minItems, maxItems } = arrayType.value;

      return yield* _(
        encodeArray(child, context, { minItems, maxItems }, (node) =>
          pipe(
            PropertyType.tryFromAST(node),
            Effect.mapError((error) => {
              throw new Error("Not implemented");
            }),
            Effect.map(encodePropertyTypeReference),
          ),
        ),
      );
    }

    const propertyType = yield* _(
      PropertyType.tryFromAST(ast),
      Effect.mapError((error) => {
        throw new Error("Not implemented");
      }),
    );

    return encodePropertyTypeReference(propertyType);
  });

const encodePropertyTypeObject = (
  ast: AST.AST,
  context: Context,
): Effect.Effect<PropertyTypeObject, EncodeError> =>
  Effect.gen(function* (_) {
    // TODO: ensure that each key is the base of the property object it is in
    if (!AST.isTypeLiteral(ast)) {
      throw new Error("expected TypeLiteral");
    }

    if (ast.indexSignatures.length > 0) {
      throw new Error("no anonymous records allowed");
    }

    const properties = yield* _(
      Stream.make(...ast.propertySignatures),
      Stream.mapEffect((property) =>
        Effect.gen(function* (_) {
          const name = property.name;
          if (!Predicate.isString(name)) {
            return yield* _(EncodeError.malformedRecord("expected string key"));
          }

          const type = property.type;
          const value = yield* _(encodePropertyTypeObjectValue(type, context));

          const ref = Predicate.hasProperty(value, "$ref")
            ? value.$ref
            : value.items.$ref;
          const base = VersionedUrl.base(ref);

          if (base !== name) {
            throw new Error("expected base to be the same as name");
          }

          return [name, value] as const;
        }),
      ),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
      Effect.map(ReadonlyRecord.fromEntries),
    );

    // the stream checks if the properties are wellformed,
    // therefore we can assume at this point that the properties are wellformed
    const required = pipe(
      ast.propertySignatures,
      ReadonlyArray.filter((property) => !property.isOptional),
      ReadonlyArray.map((property) => property.name),
      ReadonlyArray.filter(Predicate.isString),
    );

    return { type: "object", properties, required };
  });

const encodePropertyValues = (
  ast: AST.AST,
  context: Context,
): Effect.Effect<PropertyValues, EncodeError> =>
  Effect.gen(function* (_) {
    // check if the AST node is a DataType
    const dataType = yield* _(DataType.getFromAST(ast));
    if (Option.isSome(dataType)) {
      return encodeDataTypeReference(dataType.value);
    }

    const arrayType = yield* _(arrayChildNode(ast));
    if (Option.isSome(arrayType)) {
      const { child, minItems, maxItems } = arrayType.value;
      return yield* _(
        encodeArrayOfPropertyValues(child, context, { minItems, maxItems }),
      );
    }

    return yield* _(encodePropertyTypeObject(ast, context));
  });

const encodeOneOfPropertyValues = (
  ast: AST.AST,
  context: Context,
): Effect.Effect<OneOf<PropertyValues>, EncodeError> =>
  Effect.gen(function* (_) {
    return yield* _(
      encodeOneOf(ast, context, encodePropertyValues),
      Effect.map((oneOf) => ({ oneOf })),
    );
  });

const encode = (
  ast: AST.AST,
  parentContext: Context,
): Effect.Effect<PropertyTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    const { node, context } = yield* _(prepare(ast, parentContext));

    const oneOf = yield* _(encodeOneOfPropertyValues(node, context));

    const base = yield* _(makeBase(context.root, context.jsonSchema));

    return {
      ...base,
      ...oneOf,
    };
  });

export const encodeSchema = (
  ast: AST.AST,
): Effect.Effect<PropertyTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    const propertyType = yield* _(
      PropertyType.tryFromAST(ast),
      Effect.mapError(EncodeError.internal),
    );

    return yield* _(encode(ast, EncodeContext.make(propertyType)));
  });
