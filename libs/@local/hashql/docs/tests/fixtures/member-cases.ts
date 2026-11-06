import { Chunk, Option, Struct } from "effect";
import { SyntaxKind } from "typescript/ast";
import { getSynthesizedDeepClone } from "typescript/ast/clone";
import * as factory from "typescript/ast/factory";

import { firstHandle, nodeCase, secondHandle, shield } from "./node-case.js";
import * as Nodes from "./nodes.js";

import type { NodeCase } from "./node-case.js";

const name = factory.createIdentifier("Entry");
const syntaxType = factory.createKeywordTypeNode(SyntaxKind.StringKeyword);

const accessor = nodeCase({
  name: "Accessor",
  make: Nodes.Accessor.make,
  fields: {
    get: Option.none(),
    set: Option.none(),
    name: "entry",
    static: false,
  },
  changes: [
    {
      field: "name",
      apply: (fields): Nodes.Accessor.Accessor.Fields =>
        Struct.assign(fields, { name: "other" }),
    },
    {
      field: "static",
      apply: (fields): Nodes.Accessor.Accessor.Fields =>
        Struct.assign(fields, { static: true }),
    },
    {
      field: "get",
      apply: (fields): Nodes.Accessor.Accessor.Fields =>
        Struct.assign(fields, { get: Option.some(secondHandle) }),
    },
    {
      field: "set",
      apply: (fields): Nodes.Accessor.Accessor.Fields =>
        Struct.assign(fields, { set: Option.some(secondHandle) }),
    },
  ],
});

const constructor = nodeCase({
  name: "Constructor",
  make: Nodes.Constructor.make,
  fields: { overloads: Chunk.of(firstHandle) },
  changes: [
    {
      field: "overloads",
      apply: (fields): Nodes.Constructor.Constructor.Fields =>
        Struct.assign(fields, { overloads: Chunk.of(secondHandle) }),
    },
  ],
});

const enumMemberSource = factory.createEnumMember(name);
const enumMember = nodeCase({
  name: "EnumMember",
  make: Nodes.EnumMember.make,
  fields: {
    node: enumMemberSource,
    name: "member",
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.EnumMember.EnumMember.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(enumMemberSource),
        }),
    },
    {
      field: "name",
      apply: (fields): Nodes.EnumMember.EnumMember.Fields =>
        Struct.assign(fields, { name: "other" }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.EnumMember.EnumMember.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.EnumMember.EnumMember.Fields =>
    Struct.assign(fields, { node: shield(enumMemberSource) }),
});

const getterSource = factory.createGetAccessorDeclaration(
  undefined,
  name,
  undefined,
  [],
  syntaxType,
);
const getter = nodeCase({
  name: "Getter",
  make: Nodes.Getter.make,
  fields: {
    node: getterSource,
    typeParameters: Chunk.empty(),
    parameters: Chunk.empty(),
    returns: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.Getter.Getter.Fields =>
        Struct.assign(fields, { node: getSynthesizedDeepClone(getterSource) }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.Getter.Getter.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "parameters",
      apply: (fields): Nodes.Getter.Getter.Fields =>
        Struct.assign(fields, { parameters: Chunk.of(secondHandle) }),
    },
    {
      field: "returns",
      apply: (fields): Nodes.Getter.Getter.Fields =>
        Struct.assign(fields, { returns: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.Getter.Getter.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.Getter.Getter.Fields =>
    Struct.assign(fields, { node: shield(getterSource) }),
});

const indexSignatureSource = factory.createIndexSignatureDeclaration(
  undefined,
  [],
  syntaxType,
);
const indexSignature = nodeCase({
  name: "IndexSignature",
  make: Nodes.IndexSignature.make,
  fields: {
    node: indexSignatureSource,
    typeParameters: Chunk.empty(),
    parameters: Chunk.empty(),
    returns: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.IndexSignature.IndexSignature.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(indexSignatureSource),
        }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.IndexSignature.IndexSignature.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "parameters",
      apply: (fields): Nodes.IndexSignature.IndexSignature.Fields =>
        Struct.assign(fields, { parameters: Chunk.of(secondHandle) }),
    },
    {
      field: "returns",
      apply: (fields): Nodes.IndexSignature.IndexSignature.Fields =>
        Struct.assign(fields, { returns: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.IndexSignature.IndexSignature.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.IndexSignature.IndexSignature.Fields =>
    Struct.assign(fields, { node: shield(indexSignatureSource) }),
});

const method = nodeCase({
  name: "Method",
  make: Nodes.Method.make,
  fields: { overloads: Chunk.of(firstHandle), name: "entry", static: false },
  changes: [
    {
      field: "name",
      apply: (fields): Nodes.Method.Method.Fields =>
        Struct.assign(fields, { name: "other" }),
    },
    {
      field: "static",
      apply: (fields): Nodes.Method.Method.Fields =>
        Struct.assign(fields, { static: true }),
    },
    {
      field: "overloads",
      apply: (fields): Nodes.Method.Method.Fields =>
        Struct.assign(fields, { overloads: Chunk.of(secondHandle) }),
    },
  ],
});

const parameterSource = factory.createParameterDeclaration(
  undefined,
  undefined,
  name,
  undefined,
  syntaxType,
);
const parameter = nodeCase({
  name: "Parameter",
  make: Nodes.Parameter.make,
  fields: {
    node: parameterSource,
    name: "value",
    optional: false,
    rest: false,
    type: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.Parameter.Parameter.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(parameterSource),
        }),
    },
    {
      field: "name",
      apply: (fields): Nodes.Parameter.Parameter.Fields =>
        Struct.assign(fields, { name: "other" }),
    },
    {
      field: "optional",
      apply: (fields): Nodes.Parameter.Parameter.Fields =>
        Struct.assign(fields, { optional: true }),
    },
    {
      field: "rest",
      apply: (fields): Nodes.Parameter.Parameter.Fields =>
        Struct.assign(fields, { rest: true }),
    },
    {
      field: "type",
      apply: (fields): Nodes.Parameter.Parameter.Fields =>
        Struct.assign(fields, { type: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.Parameter.Parameter.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.Parameter.Parameter.Fields =>
    Struct.assign(fields, { node: shield(parameterSource) }),
});

const propertySource = factory.createPropertyDeclaration(
  undefined,
  name,
  undefined,
  syntaxType,
);
const property = nodeCase({
  name: "Property",
  make: Nodes.Property.make,
  fields: {
    node: propertySource,
    name: "Entry",
    static: false,
    type: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "name",
      apply: (fields): Nodes.Property.Property.Fields =>
        Struct.assign(fields, { name: "other" }),
    },
    {
      field: "static",
      apply: (fields): Nodes.Property.Property.Fields =>
        Struct.assign(fields, { static: true }),
    },
    {
      field: "node",
      apply: (fields): Nodes.Property.Property.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(propertySource),
        }),
    },
    {
      field: "type",
      apply: (fields): Nodes.Property.Property.Fields =>
        Struct.assign(fields, { type: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.Property.Property.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.Property.Property.Fields =>
    Struct.assign(fields, { node: shield(propertySource) }),
});

const setterSource = factory.createSetAccessorDeclaration(
  undefined,
  name,
  undefined,
  [],
);
const setter = nodeCase({
  name: "Setter",
  make: Nodes.Setter.make,
  fields: {
    node: setterSource,
    typeParameters: Chunk.empty(),
    parameters: Chunk.empty(),
    returns: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.Setter.Setter.Fields =>
        Struct.assign(fields, { node: getSynthesizedDeepClone(setterSource) }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.Setter.Setter.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "parameters",
      apply: (fields): Nodes.Setter.Setter.Fields =>
        Struct.assign(fields, { parameters: Chunk.of(secondHandle) }),
    },
    {
      field: "returns",
      apply: (fields): Nodes.Setter.Setter.Fields =>
        Struct.assign(fields, { returns: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.Setter.Setter.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.Setter.Setter.Fields =>
    Struct.assign(fields, { node: shield(setterSource) }),
});

const typeParameterSource = factory.createTypeParameterDeclaration(
  undefined,
  name,
);
const typeParameter = nodeCase({
  name: "TypeParameter",
  make: Nodes.TypeParameter.make,
  fields: {
    node: typeParameterSource,
    name: "T",
    constraint: Option.none(),
    default: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.TypeParameter.TypeParameter.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(typeParameterSource),
        }),
    },
    {
      field: "name",
      apply: (fields): Nodes.TypeParameter.TypeParameter.Fields =>
        Struct.assign(fields, { name: "other" }),
    },
    {
      field: "constraint",
      apply: (fields): Nodes.TypeParameter.TypeParameter.Fields =>
        Struct.assign(fields, { constraint: Option.some(secondHandle) }),
    },
    {
      field: "default",
      apply: (fields): Nodes.TypeParameter.TypeParameter.Fields =>
        Struct.assign(fields, { default: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.TypeParameter.TypeParameter.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.TypeParameter.TypeParameter.Fields =>
    Struct.assign(fields, { node: shield(typeParameterSource) }),
});

export const cases: readonly NodeCase[] = [
  accessor,
  constructor,
  enumMember,
  getter,
  indexSignature,
  method,
  parameter,
  property,
  setter,
  typeParameter,
];
