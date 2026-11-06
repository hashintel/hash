import { Chunk, Option, Struct } from "effect";
import { SyntaxKind } from "typescript/ast";
import { getSynthesizedDeepClone } from "typescript/ast/clone";
import * as factory from "typescript/ast/factory";

import { firstHandle, nodeCase, secondHandle, shield } from "./node-case.js";
import * as Nodes from "./nodes.js";

import type { NodeCase } from "./node-case.js";

const name = factory.createIdentifier("Entry");
const syntaxType = factory.createKeywordTypeNode(SyntaxKind.StringKeyword);

const alias = nodeCase({
  name: "Alias",
  make: Nodes.Alias.make,
  fields: { name: "entry", target: firstHandle, typeOnlyExport: false },
  changes: [
    {
      field: "name",
      apply: (fields): Nodes.Alias.Alias.Fields =>
        Struct.assign(fields, { name: "other" }),
    },
    {
      field: "target",
      apply: (fields): Nodes.Alias.Alias.Fields =>
        Struct.assign(fields, { target: secondHandle }),
    },
    {
      field: "typeOnlyExport",
      apply: (fields): Nodes.Alias.Alias.Fields =>
        Struct.assign(fields, { typeOnlyExport: true }),
    },
  ],
});

const classDeclarationSource = factory.createClassDeclaration(
  undefined,
  name,
  undefined,
  undefined,
  [],
);
const classDeclaration = nodeCase({
  name: "ClassDeclaration",
  make: Nodes.ClassDeclaration.make,
  fields: {
    node: classDeclarationSource,
    typeParameters: Chunk.empty(),
    extends: Option.none(),
    implements: Chunk.empty(),
    members: Chunk.empty(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.ClassDeclaration.ClassDeclaration.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(classDeclarationSource),
        }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.ClassDeclaration.ClassDeclaration.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "extends",
      apply: (fields): Nodes.ClassDeclaration.ClassDeclaration.Fields =>
        Struct.assign(fields, { extends: Option.some(secondHandle) }),
    },
    {
      field: "implements",
      apply: (fields): Nodes.ClassDeclaration.ClassDeclaration.Fields =>
        Struct.assign(fields, { implements: Chunk.of(secondHandle) }),
    },
    {
      field: "members",
      apply: (fields): Nodes.ClassDeclaration.ClassDeclaration.Fields =>
        Struct.assign(fields, { members: Chunk.of(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.ClassDeclaration.ClassDeclaration.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.ClassDeclaration.ClassDeclaration.Fields =>
    Struct.assign(fields, { node: shield(classDeclarationSource) }),
});

const constantDeclarationSource = factory.createVariableDeclaration(
  name,
  undefined,
  syntaxType,
);
const constantDeclaration = nodeCase({
  name: "ConstantDeclaration",
  make: Nodes.ConstantDeclaration.make,
  fields: {
    node: constantDeclarationSource,
    type: Option.none(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.ConstantDeclaration.ConstantDeclaration.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(constantDeclarationSource),
        }),
    },
    {
      field: "type",
      apply: (fields): Nodes.ConstantDeclaration.ConstantDeclaration.Fields =>
        Struct.assign(fields, { type: Option.some(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.ConstantDeclaration.ConstantDeclaration.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.ConstantDeclaration.ConstantDeclaration.Fields =>
    Struct.assign(fields, { node: shield(constantDeclarationSource) }),
});

const enumDeclarationSource = factory.createEnumDeclaration(
  undefined,
  name,
  [],
);
const enumDeclaration = nodeCase({
  name: "EnumDeclaration",
  make: Nodes.EnumDeclaration.make,
  fields: {
    node: enumDeclarationSource,
    members: Chunk.empty(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.EnumDeclaration.EnumDeclaration.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(enumDeclarationSource),
        }),
    },
    {
      field: "members",
      apply: (fields): Nodes.EnumDeclaration.EnumDeclaration.Fields =>
        Struct.assign(fields, { members: Chunk.of(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.EnumDeclaration.EnumDeclaration.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.EnumDeclaration.EnumDeclaration.Fields =>
    Struct.assign(fields, { node: shield(enumDeclarationSource) }),
});

const functionOverloads = nodeCase({
  name: "FunctionOverloads",
  make: Nodes.FunctionOverloads.make,
  fields: { overloads: Chunk.of(firstHandle) },
  changes: [
    {
      field: "overloads",
      apply: (fields): Nodes.FunctionOverloads.FunctionOverloads.Fields =>
        Struct.assign(fields, { overloads: Chunk.of(secondHandle) }),
    },
  ],
});

const callableConstantSource = factory.createVariableDeclaration(
  name,
  undefined,
  syntaxType,
);
const callableConstant = nodeCase({
  name: "CallableConstant",
  make: Nodes.CallableConstant.make,
  fields: {
    node: callableConstantSource,
    overloads: Chunk.of(firstHandle),
    type: firstHandle,
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.CallableConstant.CallableConstant.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(callableConstantSource),
        }),
    },
    {
      field: "overloads",
      apply: (fields): Nodes.CallableConstant.CallableConstant.Fields =>
        Struct.assign(fields, { overloads: Chunk.of(secondHandle) }),
    },
    {
      field: "type",
      apply: (fields): Nodes.CallableConstant.CallableConstant.Fields =>
        Struct.assign(fields, { type: secondHandle }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.CallableConstant.CallableConstant.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.CallableConstant.CallableConstant.Fields =>
    Struct.assign(fields, { node: shield(callableConstantSource) }),
});

const independentDeclarations = nodeCase({
  name: "IndependentDeclarations",
  make: Nodes.IndependentDeclarations.make,
  fields: { type: Option.none(), value: Option.none() },
  changes: [
    {
      field: "type",
      apply: (
        fields,
      ): Nodes.IndependentDeclarations.IndependentDeclarations.Fields =>
        Struct.assign(fields, { type: Option.some(secondHandle) }),
    },
    {
      field: "value",
      apply: (
        fields,
      ): Nodes.IndependentDeclarations.IndependentDeclarations.Fields =>
        Struct.assign(fields, { value: Option.some(secondHandle) }),
    },
  ],
});

const interfaceDeclarationSource = factory.createInterfaceDeclaration(
  undefined,
  name,
  undefined,
  undefined,
  [],
);
const interfaceDeclaration = nodeCase({
  name: "InterfaceDeclaration",
  make: Nodes.InterfaceDeclaration.make,
  fields: {
    node: interfaceDeclarationSource,
    typeParameters: Chunk.empty(),
    extends: Chunk.empty(),
    members: Chunk.empty(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.InterfaceDeclaration.InterfaceDeclaration.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(interfaceDeclarationSource),
        }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.InterfaceDeclaration.InterfaceDeclaration.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "extends",
      apply: (fields): Nodes.InterfaceDeclaration.InterfaceDeclaration.Fields =>
        Struct.assign(fields, { extends: Chunk.of(secondHandle) }),
    },
    {
      field: "members",
      apply: (fields): Nodes.InterfaceDeclaration.InterfaceDeclaration.Fields =>
        Struct.assign(fields, { members: Chunk.of(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.InterfaceDeclaration.InterfaceDeclaration.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.InterfaceDeclaration.InterfaceDeclaration.Fields =>
    Struct.assign(fields, { node: shield(interfaceDeclarationSource) }),
});

const jointDeclaration = nodeCase({
  name: "JointDeclaration",
  make: Nodes.JointDeclaration.make,
  fields: { declaration: firstHandle },
  changes: [
    {
      field: "declaration",
      apply: (fields): Nodes.JointDeclaration.JointDeclaration.Fields =>
        Struct.assign(fields, { declaration: secondHandle }),
    },
  ],
});

const namespaceDeclarationSource = factory.createModuleDeclaration(
  undefined,
  SyntaxKind.NamespaceKeyword,
  name,
);
const namespaceDeclaration = nodeCase({
  name: "NamespaceDeclaration",
  make: Nodes.NamespaceDeclaration.make,
  fields: {
    node: namespaceDeclarationSource,
    items: Chunk.empty(),
    exports: Chunk.empty(),
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.NamespaceDeclaration.NamespaceDeclaration.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(namespaceDeclarationSource),
        }),
    },
    {
      field: "items",
      apply: (fields): Nodes.NamespaceDeclaration.NamespaceDeclaration.Fields =>
        Struct.assign(fields, { items: Chunk.of(secondHandle) }),
    },
    {
      field: "exports",
      apply: (fields): Nodes.NamespaceDeclaration.NamespaceDeclaration.Fields =>
        Struct.assign(fields, { exports: Chunk.of(secondHandle) }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.NamespaceDeclaration.NamespaceDeclaration.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.NamespaceDeclaration.NamespaceDeclaration.Fields =>
    Struct.assign(fields, { node: shield(namespaceDeclarationSource) }),
});

const typeAliasDeclarationSource = factory.createTypeAliasDeclaration(
  undefined,
  name,
  undefined,
  syntaxType,
);
const typeAliasDeclaration = nodeCase({
  name: "TypeAliasDeclaration",
  make: Nodes.TypeAliasDeclaration.make,
  fields: {
    node: typeAliasDeclarationSource,
    typeParameters: Chunk.empty(),
    type: firstHandle,
    documentation: Option.none(),
  },
  changes: [
    {
      field: "node",
      apply: (fields): Nodes.TypeAliasDeclaration.TypeAliasDeclaration.Fields =>
        Struct.assign(fields, {
          node: getSynthesizedDeepClone(typeAliasDeclarationSource),
        }),
    },
    {
      field: "typeParameters",
      apply: (fields): Nodes.TypeAliasDeclaration.TypeAliasDeclaration.Fields =>
        Struct.assign(fields, { typeParameters: Chunk.of(secondHandle) }),
    },
    {
      field: "type",
      apply: (fields): Nodes.TypeAliasDeclaration.TypeAliasDeclaration.Fields =>
        Struct.assign(fields, { type: secondHandle }),
    },
    {
      field: "documentation",
      apply: (fields): Nodes.TypeAliasDeclaration.TypeAliasDeclaration.Fields =>
        Struct.assign(fields, { documentation: Option.some(secondHandle) }),
    },
  ],
  trapped: (fields): Nodes.TypeAliasDeclaration.TypeAliasDeclaration.Fields =>
    Struct.assign(fields, { node: shield(typeAliasDeclarationSource) }),
});

export const cases: readonly NodeCase[] = [
  alias,
  classDeclaration,
  constantDeclaration,
  enumDeclaration,
  functionOverloads,
  callableConstant,
  independentDeclarations,
  interfaceDeclaration,
  jointDeclaration,
  namespaceDeclaration,
  typeAliasDeclaration,
];
