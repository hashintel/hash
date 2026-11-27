import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  listDataTypeBaseUrl,
  listDataTypeDescription,
  listDataTypeId,
  listDataTypeTitle,
} from "./list-util";

import type {
  BaseUrl,
  DataType,
  SingleValueConstraints,
  VersionedUrl,
} from "@blockprotocol/type-system";

export type PrimitiveRootType = {
  dataTypeId: VersionedUrl;
  baseUrl: BaseUrl;
  title: string;
  description: string;
  type: SingleValueConstraints["type"];
};

/**
 * The Block Protocol primitive data types, in the order the picker lists them.
 *
 * All of them ship with the type fetcher as predefined schemas
 * (libs/@local/graph/type-fetcher/predefined_types/data_types), so they can be
 * referenced before the graph holds a copy — the graph loads them on first
 * reference. Until then they are absent from the loaded data types, and the
 * picker offers these statically-known identities instead.
 */
export const primitiveRootTypes: PrimitiveRootType[] = [
  {
    dataTypeId: blockProtocolDataTypes.text.dataTypeId,
    baseUrl: blockProtocolDataTypes.text.dataTypeBaseUrl,
    title: blockProtocolDataTypes.text.title,
    description: blockProtocolDataTypes.text.description,
    type: "string",
  },
  {
    dataTypeId: blockProtocolDataTypes.number.dataTypeId,
    baseUrl: blockProtocolDataTypes.number.dataTypeBaseUrl,
    title: blockProtocolDataTypes.number.title,
    description: blockProtocolDataTypes.number.description,
    type: "number",
  },
  {
    dataTypeId: blockProtocolDataTypes.boolean.dataTypeId,
    baseUrl: blockProtocolDataTypes.boolean.dataTypeBaseUrl,
    title: blockProtocolDataTypes.boolean.title,
    description: blockProtocolDataTypes.boolean.description,
    type: "boolean",
  },
  {
    dataTypeId: listDataTypeId,
    baseUrl: listDataTypeBaseUrl,
    title: listDataTypeTitle,
    description: listDataTypeDescription,
    type: "array",
  },
  {
    dataTypeId: blockProtocolDataTypes.object.dataTypeId,
    baseUrl: blockProtocolDataTypes.object.dataTypeBaseUrl,
    title: blockProtocolDataTypes.object.title,
    description: blockProtocolDataTypes.object.description,
    type: "object",
  },
  {
    dataTypeId: blockProtocolDataTypes.null.dataTypeId,
    baseUrl: blockProtocolDataTypes.null.dataTypeBaseUrl,
    title: blockProtocolDataTypes.null.title,
    description: blockProtocolDataTypes.null.description,
    type: "null",
  },
];

export const primitiveRootTypeByBaseUrl = new Map(
  primitiveRootTypes.map((rootType) => [rootType.baseUrl, rootType]),
);

/** A schema's single primitive value type — `null` for `anyOf` unions */
export const primitiveTypeFromSchema = (
  schema: DataType,
): SingleValueConstraints["type"] | null =>
  "anyOf" in schema ? null : schema.type;

/**
 * The root type a parentless group extends: the graph requires every type to
 * extend something, and the members' primitive root adds nothing beyond the
 * bare arm the group already carries.
 */
export const primitiveRootRefFor = (
  primitive: SingleValueConstraints["type"] | null,
): VersionedUrl | null =>
  primitive !== null
    ? (primitiveRootTypes.find((rootType) => rootType.type === primitive)
        ?.dataTypeId ?? null)
    : null;

/**
 * The inbuilt base types — the primitive roots (Text, Number, List, …) and
 * the universal Value type. They sit at version 1 forever, so version tags
 * on them are noise.
 */
export const isBaseDataTypeBaseUrl = (baseUrl: BaseUrl): boolean =>
  primitiveRootTypeByBaseUrl.has(baseUrl) ||
  baseUrl === blockProtocolDataTypes.value.dataTypeBaseUrl;
