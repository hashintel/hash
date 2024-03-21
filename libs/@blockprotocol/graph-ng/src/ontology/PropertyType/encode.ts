import { AST } from "@effect/schema";
import {
  Chunk,
  Effect,
  Option,
  pipe,
  Predicate,
  ReadonlyArray,
  ReadonlyRecord,
  Stream,
} from "effect";

import * as VersionedUrl from "../../VersionedUrl.js";
import * as DataType from "../DataType.js";
import { asNumberOrUndefined } from "../internal/encode.js";
import * as EncodeContext from "../internal/EncodeContext.js";
import * as PropertyType from "../PropertyType.js";
import { EncodeError } from "./error.js";
import {
  Array,
  ArrayOfPropertyValues,
  DataTypeReference,
  makeBase,
  OneOf,
  PropertyTypeObject,
  PropertyTypeObjectValue,
  PropertyTypeReference,
  PropertyTypeSchema,
  PropertyValues,
} from "./schema.js";

type Context = EncodeContext.EncodeContext<PropertyType.PropertyType<unknown>>;

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

        const { context } = yield* _(
          EncodeContext.visit(node, currentContext),
          Effect.mapError(EncodeError.visit),
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

const pruneUndefined = (ast: AST.AST): AST.AST => {
  if (!AST.isUnion(ast)) {
    return ast;
  }

  const types = ast.types.filter((type) => !AST.isUndefinedKeyword(type));
  return AST.Union.make(types, ast.annotations);
};

const prepare = (
  ast: AST.AST | (() => AST.AST),
  parentContext: Context,
): Effect.Effect<{ node: AST.AST; context: Context }, EncodeError> =>
  Effect.gen(function* (_) {
    const { node, context, staleContext } = yield* _(
      EncodeContext.visit(ast, parentContext),
      Effect.mapError(EncodeError.visit),
    );

    // do not continue to prepare if the node is a PropertyType or DataType
    // How this works:
    // We can only refer to ourselves (create a loop) if we suspend.
    // If we naively check if a node is a `PropertyType` or `DataType` we would immediately abort,
    // because the first node is always a `PropertyType`, therefore we have an additional check at suspenseDepth === 0
    // to check if the referenced `PropertyType` is us, if that's the case we continue, otherwise we return.
    if (DataType.isAST(node)) {
      // we choose to take the `staleContext` as to not pollute the `context` with `DataType` information
      return { node, context: staleContext };
    }

    const maybePropertyType = yield* _(PropertyType.getFromAST(node));
    if (Option.isSome(maybePropertyType)) {
      if (context.state.suspenseDepth > 0) {
        return { node, context: staleContext };
      }

      // suspenseDepth === 0

      if (maybePropertyType.value.id !== parentContext.root.id) {
        return { node, context: staleContext };
      }
    }

    switch (node._tag) {
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
        return { node, context };
      case "Refinement":
        return yield* _(prepare(node.from, context));
      case "TupleType":
      case "TypeLiteral":
        return { node, context };
      case "Union":
        return yield* _(
          flattenUnion(node, context),
          Effect.andThen((flat) => ({ node: flat, context })),
        );
      case "Suspend":
        return yield* _(prepare(node.f, context));
      case "Transformation":
        return yield* _(prepare(node.from, context));
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
      Stream.mapEffect((child) => prepare(child, context)),
      Stream.mapEffect(({ node: child, context: childContext }) =>
        map(child, childContext),
      ),
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
  // eslint-disable-next-line func-names
  Effect.gen(function* (_) {
    return yield* _(
      encodeArray(
        ast,
        parentContext,
        { minItems: minItemsOverride, maxItems: maxItemsOverride },
        (node, context) =>
          pipe(
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
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
  }>,
  EncodeError
> =>
  Effect.gen(function* (_) {
    if (!AST.isTupleType(node)) {
      return Option.none();
    }

    // if we have the same elements in a tuple that can be used as a fixed sized array
    const elements = node.elements;
    const rest = node.rest;

    if (elements.length !== 0 && rest.length !== 0) {
      return yield* _(
        EncodeError.malformedArray("tuple with rest elements are unsupported"),
      );
    }

    if (rest.length > 1) {
      return yield* _(
        EncodeError.malformedArray(
          "tuple with trailing elements are unsupported",
        ),
      );
    }

    if (elements.length > 0) {
      // any optional elements are not allowed
      if (elements.some((element) => element.isOptional)) {
        return yield* _(
          EncodeError.malformedArray("optional tuple elements are unsupported"),
        );
      }

      // see if the elements are all the same
      const areEqual = pipe(
        elements,
        ReadonlyArray.map((element) => element.type),
        ReadonlyArray.map(AST.hash),
        ReadonlyArray.dedupe,
        ReadonlyArray.length,
        (length) => length === 1,
      );

      if (!areEqual) {
        return yield* _(
          EncodeError.malformedArray("tuple elements must be the same"),
        );
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
  parentContext: Context,
): Effect.Effect<PropertyTypeObjectValue, EncodeError> =>
  Effect.gen(function* (_) {
    const { node, context } = yield* _(prepare(ast, parentContext));

    const arrayType = yield* _(arrayChildNode(node));
    if (Option.isSome(arrayType)) {
      const { child, minItems, maxItems } = arrayType.value;

      return yield* _(
        encodeArray(child, context, { minItems, maxItems }, (value) =>
          pipe(
            PropertyType.tryFromAST(value),
            Effect.mapError(() =>
              EncodeError.malformedPropertyObject(
                "expected PropertyType as value",
              ),
            ),
            Effect.map(encodePropertyTypeReference),
          ),
        ),
      );
    }

    const propertyType = yield* _(
      PropertyType.tryFromAST(node),
      Effect.mapError(() =>
        EncodeError.malformedPropertyObject("expected PropertyType as value"),
      ),
    );

    return encodePropertyTypeReference(propertyType);
  });

const encodePropertyTypeObject = (
  ast: AST.AST,
  context: Context,
): Effect.Effect<PropertyTypeObject, EncodeError> =>
  Effect.gen(function* (_) {
    if (!AST.isTypeLiteral(ast)) {
      return yield* _(EncodeError.unableToEncode(ast));
    }

    if (ast.indexSignatures.length > 0) {
      return yield* _(
        EncodeError.malformedPropertyObject("records are unsupported"),
      );
    }

    const properties = yield* _(
      Stream.make(...ast.propertySignatures),
      Stream.mapEffect((property) =>
        // eslint-disable-next-line @typescript-eslint/no-shadow
        Effect.gen(function* (_) {
          const name = property.name;
          if (!Predicate.isString(name)) {
            return yield* _(
              EncodeError.malformedPropertyObject("expected string key"),
            );
          }

          // if optional remove the undefined value from the union type
          const type = property.isOptional
            ? pruneUndefined(property.type)
            : property.type;

          const value = yield* _(encodePropertyTypeObjectValue(type, context));

          const ref = Predicate.hasProperty(value, "$ref")
            ? value.$ref
            : value.items.$ref;
          const base = VersionedUrl.base(ref);

          if (base !== name) {
            return yield* _(
              EncodeError.malformedPropertyObject(
                "key is not BaseUrl of PropertyTypeUrl",
              ),
            );
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
