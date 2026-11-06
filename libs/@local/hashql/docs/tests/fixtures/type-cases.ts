import { Chunk, Option, Struct } from "effect";
import { SyntaxKind } from "typescript/ast";
import { getSynthesizedDeepClone } from "typescript/ast/clone";
import * as factory from "typescript/ast/factory";

import { firstHandle, nodeCase, secondHandle, shield } from "./node-case.js";
import * as Nodes from "./nodes.js";

import type { NodeCase } from "./node-case.js";

const name = factory.createIdentifier("Entry");
const syntaxType = factory.createKeywordTypeNode(SyntaxKind.StringKeyword);

const callSignatureSource = factory.createCallSignatureDeclaration(
  undefined,
  [],
  syntaxType,
);
const callSignature = nodeCase({
  name: "CallSignature",
  make: Nodes.CallSignature.make,
  fields: {
    node: callSignatureSource,
    typeParameters: Chunk.empty(),
    parameters: Chunk.empty(),
    returns: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.CallSignature.CallSignature.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(callSignatureSource),
        }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.CallSignature.CallSignature.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "parameters",
      apply: (fields): Nodes.CallSignature.CallSignature.Fields =>
        Struct.assign(fields, { parameters: Chunk.of(secondHandle) }),
    },
    {
      field: "returns",
      apply: (fields): Nodes.CallSignature.CallSignature.Fields =>
        Struct.assign(fields, { returns: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.CallSignature.CallSignature.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.CallSignature.CallSignature.Fields =>
    Struct.assign(fields, { node: shield(callSignatureSource) }),
});

const constructorTypeSource = factory.createConstructorTypeNode(
  undefined,
  undefined,
  [],
  syntaxType,
);
const constructorType = nodeCase({
  name: "ConstructorType",
  make: Nodes.ConstructorType.make,
  fields: {
    node: constructorTypeSource,
    typeParameters: Chunk.empty(),
    parameters: Chunk.empty(),
    returns: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.ConstructorType.ConstructorType.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(constructorTypeSource),
        }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.ConstructorType.ConstructorType.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "parameters",
      apply: (fields): Nodes.ConstructorType.ConstructorType.Fields =>
        Struct.assign(fields, { parameters: Chunk.of(secondHandle) }),
    },
    {
      field: "returns",
      apply: (fields): Nodes.ConstructorType.ConstructorType.Fields =>
        Struct.assign(fields, { returns: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.ConstructorType.ConstructorType.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.ConstructorType.ConstructorType.Fields =>
    Struct.assign(fields, { node: shield(constructorTypeSource) }),
});

const constructSignatureSource = factory.createConstructSignatureDeclaration(
  undefined,
  [],
  syntaxType,
);
const constructSignature = nodeCase({
  name: "ConstructSignature",
  make: Nodes.ConstructSignature.make,
  fields: {
    node: constructSignatureSource,
    typeParameters: Chunk.empty(),
    parameters: Chunk.empty(),
    returns: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.ConstructSignature.ConstructSignature.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(constructSignatureSource),
        }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.ConstructSignature.ConstructSignature.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "parameters",
      apply: (fields): Nodes.ConstructSignature.ConstructSignature.Fields =>
        Struct.assign(fields, { parameters: Chunk.of(secondHandle) }),
    },
    {
      field: "returns",
      apply: (fields): Nodes.ConstructSignature.ConstructSignature.Fields =>
        Struct.assign(fields, { returns: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.ConstructSignature.ConstructSignature.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.ConstructSignature.ConstructSignature.Fields =>
    Struct.assign(fields, { node: shield(constructSignatureSource) }),
});

const functionTypeSource = factory.createFunctionTypeNode(
  undefined,
  [],
  syntaxType,
);
const functionType = nodeCase({
  name: "FunctionType",
  make: Nodes.FunctionType.make,
  fields: {
    node: functionTypeSource,
    typeParameters: Chunk.empty(),
    parameters: Chunk.empty(),
    returns: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.FunctionType.FunctionType.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(functionTypeSource),
        }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.FunctionType.FunctionType.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "parameters",
      apply: (fields): Nodes.FunctionType.FunctionType.Fields =>
        Struct.assign(fields, { parameters: Chunk.of(secondHandle) }),
    },
    {
      field: "returns",
      apply: (fields): Nodes.FunctionType.FunctionType.Fields =>
        Struct.assign(fields, { returns: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.FunctionType.FunctionType.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.FunctionType.FunctionType.Fields =>
    Struct.assign(fields, { node: shield(functionTypeSource) }),
});

const objectTypeSource = factory.createTypeLiteralNode([]);
const objectType = nodeCase({
  name: "ObjectType",
  make: Nodes.ObjectType.make,
  fields: { node: objectTypeSource, members: Chunk.empty() },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.ObjectType.ObjectType.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(objectTypeSource),
        }),
    },
    {
      field: "members",
      apply: (fields): Nodes.ObjectType.ObjectType.Fields =>
        Struct.assign(fields, { members: Chunk.of(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.ObjectType.ObjectType.Fields =>
    Struct.assign(fields, { node: shield(objectTypeSource) }),
});

const referenceSource = factory.createIdentifier("reference");
const reference = nodeCase({
  name: "Reference",
  make: Nodes.Reference.make,
  fields: {
    node: referenceSource,
    target: { _tag: "Local", node: firstHandle },
    url: Option.none(),
    quickInfo: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.Reference.Reference.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(referenceSource),
        }),
    },
    {
      field: "target",
      apply: (fields): Nodes.Reference.Reference.Fields =>
        Struct.assign(fields, {
          target: { _tag: "Local" as const, node: secondHandle },
        }),
    },
  ],
  trapped: (fields): Nodes.Reference.Reference.Fields =>
    Struct.assign(fields, { node: shield(referenceSource) }),
});

const typeExpressionSource = syntaxType;
const typeExpression = nodeCase({
  name: "TypeExpression",
  make: Nodes.TypeExpression.make,
  fields: {
    node: typeExpressionSource,
    children: Chunk.empty(),
    references: Chunk.empty(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.TypeExpression.TypeExpression.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(typeExpressionSource),
        }),
    },
    {
      field: "children",
      apply: (fields): Nodes.TypeExpression.TypeExpression.Fields =>
        Struct.assign(fields, { children: Chunk.of(secondHandle) }),
    },
    {
      field: "references",
      apply: (fields): Nodes.TypeExpression.TypeExpression.Fields =>
        Struct.assign(fields, { references: Chunk.of(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.TypeExpression.TypeExpression.Fields =>
    Struct.assign(fields, { node: shield(typeExpressionSource) }),
});

const typeReferenceSource = factory.createTypeReferenceNode(name);
const typeReference = nodeCase({
  name: "TypeReference",
  make: Nodes.TypeReference.make,
  fields: {
    node: typeReferenceSource,
    reference: firstHandle,
    typeArguments: Chunk.empty(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.TypeReference.TypeReference.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(typeReferenceSource),
        }),
    },
    {
      field: "reference",
      apply: (fields): Nodes.TypeReference.TypeReference.Fields =>
        Struct.assign(fields, { reference: secondHandle }),
    },
    {
      field: "typeArguments",
      apply: (fields): Nodes.TypeReference.TypeReference.Fields =>
        Struct.assign(fields, { typeArguments: Chunk.of(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.TypeReference.TypeReference.Fields =>
    Struct.assign(fields, { node: shield(typeReferenceSource) }),
});

export const cases: readonly NodeCase[] = [
  callSignature,
  constructorType,
  constructSignature,
  functionType,
  objectType,
  reference,
  typeExpression,
  typeReference,
];
