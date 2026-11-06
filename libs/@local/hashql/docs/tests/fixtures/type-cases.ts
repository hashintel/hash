import { Chunk, Option, Struct } from "effect";
import { SyntaxKind } from "typescript/ast";
import { getSynthesizedDeepClone } from "typescript/ast/clone";
import * as factory from "typescript/ast/factory";

import {
  firstSymbol,
  nodeCase,
  secondHandle,
  secondSymbol,
  shield,
} from "./node-case.js";
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

const externalItem = nodeCase({
  name: "ExternalItem",
  make: Nodes.ExternalItem.make,
  fields: {
    symbol: firstSymbol,
    name: "Entry",
    pages: {
      type: Option.none(),
      value: Option.none(),
      namespace: Option.none(),
    },
    bases: [],
  },
  changes: [
    {
      field: "symbol",
      apply: (fields): Nodes.ExternalItem.ExternalItem.Fields =>
        Struct.assign(fields, { symbol: secondSymbol }),
    },
    {
      field: "name",
      apply: (fields): Nodes.ExternalItem.ExternalItem.Fields =>
        Struct.assign(fields, { name: "Other" }),
    },
    {
      field: "pages",
      apply: (fields): Nodes.ExternalItem.ExternalItem.Fields =>
        Struct.assign(fields, {
          pages: Struct.assign(fields.pages, {
            type: Option.some(new URL("https://hash.dev/docs/entry")),
          }),
        }),
    },
    {
      field: "bases",
      apply: (fields): Nodes.ExternalItem.ExternalItem.Fields =>
        Struct.assign(fields, { bases: [secondSymbol] }),
    },
  ],
  trapped: (fields): Nodes.ExternalItem.ExternalItem.Fields =>
    Struct.assign(fields, {
      symbol: shield(firstSymbol),
      bases: [shield(secondSymbol)],
    }),
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
        Struct.assign(fields, { references: Chunk.of(secondSymbol) }),
    },
  ],
  trapped: (fields): Nodes.TypeExpression.TypeExpression.Fields =>
    Struct.assign(fields, {
      node: shield(typeExpressionSource),
      references: Chunk.of(shield(firstSymbol)),
    }),
});

const typeReferenceSource = factory.createTypeReferenceNode(name);
const typeReference = nodeCase({
  name: "TypeReference",
  make: Nodes.TypeReference.make,
  fields: {
    node: typeReferenceSource,
    qualifiers: Chunk.empty(),
    target: firstSymbol,
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
      field: "qualifiers",
      apply: (fields): Nodes.TypeReference.TypeReference.Fields =>
        Struct.assign(fields, { qualifiers: Chunk.of(secondSymbol) }),
    },
    {
      field: "target",
      apply: (fields): Nodes.TypeReference.TypeReference.Fields =>
        Struct.assign(fields, { target: secondSymbol }),
    },
    {
      field: "typeArguments",
      apply: (fields): Nodes.TypeReference.TypeReference.Fields =>
        Struct.assign(fields, { typeArguments: Chunk.of(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.TypeReference.TypeReference.Fields =>
    Struct.assign(fields, {
      node: shield(typeReferenceSource),
      qualifiers: Chunk.of(shield(firstSymbol)),
      target: shield(firstSymbol),
    }),
});

export const cases: readonly NodeCase[] = [
  callSignature,
  constructorType,
  constructSignature,
  functionType,
  objectType,
  externalItem,
  typeExpression,
  typeReference,
];
