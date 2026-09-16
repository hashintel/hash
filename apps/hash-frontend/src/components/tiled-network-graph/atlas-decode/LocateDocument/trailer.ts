import * as TypeSystem from "@blockprotocol/type-system";

import * as CborDecoder from "../CborDecoder";
import * as CborPrimitive from "../CborPrimitive";
import * as Result from "../Result";
import * as Completeness from "./completeness";
import * as LocateError from "./error";

import type * as Num from "../Num";

/** Integers remain bigint. Encoded f64 values remain numbers, even when integral. */
export type Scalar = string | bigint | number | boolean | null;
export type Properties = ReadonlyMap<TypeSystem.BaseUrl, Scalar>;
type IndexedProperties = ReadonlyMap<Num.u64, Scalar>;

export interface Trailer {
  readonly typeTable: readonly TypeSystem.VersionedUrl[];
  readonly propertyTable: readonly TypeSystem.BaseUrl[];
  readonly labels: readonly (string | null)[];
  readonly typeIds: readonly (TypeSystem.VersionedUrl | null)[];
  readonly properties: Properties | null;
  readonly linkLabels: readonly (string | null)[];
  readonly linkTypeIds: readonly (readonly TypeSystem.VersionedUrl[])[];
  readonly linkTypeIdsComplete: Completeness.Completeness;
  readonly linkProperties: readonly (Properties | null)[];
  readonly linkPropertiesComplete: Completeness.Completeness;
}

const urlVisitor = <T, E>(
  field: string,
  validate: (value: string) => TypeSystem.Result<T, E>,
): CborDecoder.CborVisitor<T, LocateError.LocateDocumentError> => ({
  expecting: "a URL",
  visitTextString: (value) => {
    const parsed = validate(value);
    return parsed.type === "Ok"
      ? Result.ok(parsed.inner)
      : Result.err(parsed.inner).pipe(
          Result.changeContext(() =>
            LocateError.LocateDocumentError.invalid(field, "invalid URL"),
          ),
        );
  },
});

const scalarVisitor: CborDecoder.CborVisitor<Scalar, never> = {
  expecting: "a scalar property (text, integer, f64, boolean or null)",
  visitUnsignedInteger: Result.ok,
  visitNegativeInteger: Result.ok,
  visitFloat64: Result.ok,
  visitTextString: Result.ok,
  visitBoolean: Result.ok,
  visitNull: () => Result.ok(null),
};

const propertiesVisitor: CborDecoder.CborVisitor<IndexedProperties, never> = {
  expecting: "an intern-indexed property map",
  visitMap: Result.fn(function* readProperties(
    access: CborDecoder.CborMapAccess,
  ) {
    const properties = new Map<Num.u64, Scalar>();

    while (access.remaining > 0) {
      const key = yield* access.readKey();
      properties.set(key, yield* access.readValue(scalarVisitor));
    }

    return properties;
  }),
};

const readTrailer = (count: Num.u64, edges: Num.u64) =>
  Result.fn(function* readTrailerMap(
    access: CborDecoder.CborMapAccess,
  ): Result.gen.Return<
    Trailer,
    | CborDecoder.CborDecoderError
    | CborPrimitive.ArrayVisitorError
    | LocateError.LocateDocumentError
    | Result.All<Error>
  > {
    let typeTable: TypeSystem.VersionedUrl[] | undefined;
    let propertyTable: TypeSystem.BaseUrl[] | undefined;
    let labels: (string | null)[] | undefined;
    let typeIds: (Num.u64 | null)[] | undefined;
    let properties: IndexedProperties | null | undefined;
    let linkLabels: (string | null)[] | undefined;
    let linkTypeIds: Num.u64[][] | undefined;
    let linkTypeIdsComplete: Uint8Array | undefined;
    let linkProperties: (IndexedProperties | null)[] | undefined;
    let linkPropertiesComplete: Uint8Array | undefined;

    while (access.remaining > 0) {
      const key = yield* access.readKey();
      switch (key) {
        case 0n:
          typeTable = yield* access.readValue(
            CborPrimitive.array(
              urlVisitor("typeTable", TypeSystem.validateVersionedUrl),
              "typeTable",
            ),
          );
          break;
        case 1n:
          propertyTable = yield* access.readValue(
            CborPrimitive.array(
              urlVisitor("propertyTable", TypeSystem.validateBaseUrl),
              "propertyTable",
            ),
          );
          break;
        case 2n:
          labels = yield* access.readValue(
            CborPrimitive.array(
              CborPrimitive.nullable(CborPrimitive.text),
              "labels",
              count,
            ),
          );
          break;
        case 3n:
          typeIds = yield* access.readValue(
            CborPrimitive.array(
              CborPrimitive.nullable(CborPrimitive.unsigned),
              "typeIds",
              count,
            ),
          );
          break;
        case 4n:
          properties = yield* access.readValue(
            CborPrimitive.nullable(propertiesVisitor),
          );
          break;
        case 5n:
          linkLabels = yield* access.readValue(
            CborPrimitive.array(
              CborPrimitive.nullable(CborPrimitive.text),
              "linkLabels",
              edges,
            ),
          );
          break;
        case 6n:
          linkTypeIds = yield* access.readValue(
            CborPrimitive.array(
              CborPrimitive.array(CborPrimitive.unsigned, "linkTypeIds.row"),
              "linkTypeIds",
              edges,
            ),
          );
          break;
        case 7n:
          linkTypeIdsComplete = yield* access.readValue(CborPrimitive.bytes);
          break;
        case 8n:
          linkProperties = yield* access.readValue(
            CborPrimitive.array(
              CborPrimitive.nullable(propertiesVisitor),
              "linkProperties",
              edges,
            ),
          );
          break;
        case 9n:
          linkPropertiesComplete = yield* access.readValue(CborPrimitive.bytes);
          break;
        default:
          yield* access.readValue(CborPrimitive.ignore);
      }
    }
    const [
      types,
      propertyUrls,
      nodeLabels,
      nodeTypes,
      sourceProperties,
      edgeLabels,
      edgeTypes,
      typeBits,
      edgeProperties,
      propertyBits,
    ] = yield* Result.all([
      Result.fromUndefined(typeTable, () =>
        LocateError.LocateDocumentError.missing("typeTable"),
      ),
      Result.fromUndefined(propertyTable, () =>
        LocateError.LocateDocumentError.missing("propertyTable"),
      ),
      Result.fromUndefined(labels, () =>
        LocateError.LocateDocumentError.missing("labels"),
      ),
      Result.fromUndefined(typeIds, () =>
        LocateError.LocateDocumentError.missing("typeIds"),
      ),
      Result.fromUndefined(properties, () =>
        LocateError.LocateDocumentError.missing("properties"),
      ),
      Result.fromUndefined(linkLabels, () =>
        LocateError.LocateDocumentError.missing("linkLabels"),
      ),
      Result.fromUndefined(linkTypeIds, () =>
        LocateError.LocateDocumentError.missing("linkTypeIds"),
      ),
      Result.fromUndefined(linkTypeIdsComplete, () =>
        LocateError.LocateDocumentError.missing("linkTypeIdsComplete"),
      ),
      Result.fromUndefined(linkProperties, () =>
        LocateError.LocateDocumentError.missing("linkProperties"),
      ),
      Result.fromUndefined(linkPropertiesComplete, () =>
        LocateError.LocateDocumentError.missing("linkPropertiesComplete"),
      ),
    ]);

    const resolveIndex =
      <T>(field: string, table: readonly T[]) =>
      (index: Num.u64) =>
        Result.assert(index < BigInt(table.length), () =>
          LocateError.LocateDocumentError.invalid(
            field,
            `intern index ${index} exceeds table length ${table.length}`,
          ),
        ).pipe(Result.map(() => table[Number(index)]!));

    const resolveType = resolveIndex("typeTable", types);
    const resolveProperty = resolveIndex("propertyTable", propertyUrls);
    const resolveProperties = (entries: IndexedProperties | null) =>
      entries === null
        ? Result.ok(null)
        : Result.all(
            [...entries].map(([index, value]) =>
              resolveProperty(index).pipe(
                Result.map((url) => [url, value] as const),
              ),
            ),
          ).pipe(Result.map((resolved) => new Map(resolved)));

    const [
      typeCompleteness,
      propertyCompleteness,
      resolvedNodeTypes,
      resolvedEdgeTypes,
      resolvedSourceProperties,
      resolvedEdgeProperties,
    ] = yield* Result.all([
      Completeness.Completeness.make(edges, typeBits),
      Completeness.Completeness.make(edges, propertyBits),
      Result.all(
        nodeTypes.map((index) =>
          index === null ? Result.ok(null) : resolveType(index),
        ),
      ),
      Result.all(
        edgeTypes.map((indexes) => Result.all(indexes.map(resolveType))),
      ),
      resolveProperties(sourceProperties),
      Result.all(edgeProperties.map(resolveProperties)),
      Result.assert(new Set(types).size === types.length, () =>
        LocateError.LocateDocumentError.invalid(
          "typeTable",
          "entries must be unique",
        ),
      ),
      Result.assert(new Set(propertyUrls).size === propertyUrls.length, () =>
        LocateError.LocateDocumentError.invalid(
          "propertyTable",
          "entries must be unique",
        ),
      ),
    ]);

    return {
      typeTable: types,
      propertyTable: propertyUrls,
      labels: nodeLabels,
      typeIds: resolvedNodeTypes,
      properties: resolvedSourceProperties,
      linkLabels: edgeLabels,
      linkTypeIds: resolvedEdgeTypes,
      linkTypeIdsComplete: typeCompleteness,
      linkProperties: resolvedEdgeProperties,
      linkPropertiesComplete: propertyCompleteness,
    };
  });

export const decode =
  (count: Num.u64, edges: Num.u64) =>
  (
    bytes: Uint8Array,
  ): Result.Result<Trailer, LocateError.LocateDocumentError> =>
    new CborDecoder.CborDecoder(bytes)
      .decode({
        expecting: "a locate trailer",
        visitMap: readTrailer(count, edges),
      })
      .pipe(
        Result.changeContext(() =>
          LocateError.LocateDocumentError.section("trailer"),
        ),
      );
