/**
 * Enforces declaration-specific casing and rejects redundant kind affixes.
 *
 * Types, classes, enums and namespaces use PascalCase. Other bindings use camelCase, with either allowed for const bindings and function declarations. Imported bindings are exempt.
 *
 * Fixes rename eligible local bindings and their references, preserving property keys and explicit export names. The rule reports directly named exports and detected scope conflicts without a fix.
 *
 * @example Incorrect
 * ```ts
 * const user_name = "Ada";
 * ```
 *
 * @example Correct
 * ```ts
 * const userName = "Ada";
 * ```
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

import { isCase, toCase } from "../lib/casing.js";
import { findKindAffix } from "../lib/kind-affixes.js";
import { reservedNames } from "../lib/reserved-names.js";

import type { Casing } from "../lib/casing.js";
import type { KindAffixMatch } from "../lib/kind-affixes.js";
import type {
  Context,
  Definition,
  ESTree,
  Fix,
  Scope,
  SourceCode,
  Variable,
} from "@oxlint/plugins";

// A JSX tag name starting with an ASCII lowercase letter denotes an intrinsic element.
const intrinsicJsxNamePattern = /^[a-z]/u;

/**
 * Names claimed by fixes reported earlier in this lint pass.
 *
 * Oxlint applies all non-overlapping fixes together. Without these claims, fixes could rename both `foo_bar` and `foo__bar` to `fooBar`. Each `Variable` belongs to one file, which also bounds the lifetime of its claim.
 */
const claimedNames = new WeakMap<Variable, string>();

const effectiveName = (variable: Variable): string =>
  claimedNames.get(variable) ?? variable.name;

interface Rename {
  /** The variables to rename together, such as a class's outer and inner binding. */
  readonly variables: ReadonlySet<Variable>;
  readonly name: string;
}

const declaredTogether = (
  sourceCode: SourceCode,
  variable: Variable,
): ReadonlySet<Variable> => {
  const starts = new Set(
    variable.identifiers.map((identifier) => identifier.range[0]),
  );
  const variables = variable.defs
    .flatMap((definition) => sourceCode.getDeclaredVariables(definition.node))
    .filter((candidate) =>
      candidate.identifiers.some((identifier) =>
        starts.has(identifier.range[0]),
      ),
    );

  return new Set([variable, ...variables]);
};

const isExportedDeclaration = (definition: Definition): boolean => {
  if (definition.type === "Parameter" || definition.type === "CatchClause") {
    return false;
  }

  if (definition.type === "Variable") {
    return definition.parent?.parent?.type === "ExportNamedDeclaration";
  }

  return definition.node.parent?.type === "ExportNamedDeclaration";
};

const isAmbient = (sourceCode: SourceCode, definition: Definition): boolean =>
  sourceCode
    .getAncestors(definition.name)
    .some((node) => "declare" in node && node.declare === true);

// Renaming a parameter property or an enum member would rename a member of an object.
const definesMember = (definition: Definition): boolean => {
  let { parent } = definition.name;

  while (parent.type === "AssignmentPattern") {
    ({ parent } = parent);
  }

  return (
    definition.node.type === "TSEnumMember" ||
    parent.type === "TSParameterProperty"
  );
};

const hasWithScope = (scope: Scope): boolean =>
  scope.type === "with" ||
  scope.childScopes.some((child) => hasWithScope(child));

const isRenameable = (sourceCode: SourceCode, variable: Variable): boolean =>
  // Bindings in a script's global scope are visible to other scripts.
  variable.scope.type !== "global" &&
  variable.defs.length > 0 &&
  variable.defs.every(
    (definition) =>
      !isExportedDeclaration(definition) &&
      !isAmbient(sourceCode, definition) &&
      !definesMember(definition),
  ) &&
  !hasWithScope(variable.scope) &&
  !variable.scope.through.some(
    (reference) => reference.identifier.name === "eval",
  );

const declares = (scope: Scope, rename: Rename): boolean =>
  scope.variables.some(
    (candidate) =>
      !rename.variables.has(candidate) &&
      effectiveName(candidate) === rename.name,
  );

/** Whether a scope from `from` up to, but excluding, the variable's scope declares the name. */
const isShadowed = (
  from: Scope,
  variable: Variable,
  rename: Rename,
): boolean => {
  for (
    let scope: Scope | null = from;
    scope !== null && scope !== variable.scope;
    scope = scope.upper
  ) {
    if (declares(scope, rename)) {
      return true;
    }
  }

  return false;
};

/** Whether declaring the name in `scope` would capture references that resolve elsewhere. */
const captures = (scope: Scope, rename: Rename): boolean =>
  scope.through.some((reference) => {
    if (reference.resolved === null) {
      return reference.identifier.name === rename.name;
    }

    return effectiveName(reference.resolved) === rename.name;
  });

const hasConflict = (sourceCode: SourceCode, rename: Rename): boolean =>
  [...rename.variables].some(
    (variable) =>
      declares(variable.scope, rename) ||
      captures(variable.scope, rename) ||
      variable.references.some((reference) =>
        isShadowed(reference.from, variable, rename),
      ) ||
      // A `var` declared in a block must not collide with that block's bindings either.
      variable.identifiers.some((identifier) =>
        isShadowed(sourceCode.getScope(identifier), variable, rename),
      ),
  );

/** Every node spelling the name. Declarations and their `init` references may coincide. */
const nameNodes = (rename: Rename): ESTree.Node[] => {
  const nodes = new Map<number, ESTree.Node>();

  for (const variable of rename.variables) {
    for (const identifier of variable.identifiers) {
      nodes.set(identifier.range[0], identifier);
    }

    for (const reference of variable.references) {
      nodes.set(reference.identifier.range[0], reference.identifier);
    }
  }

  return [...nodes.values()];
};

const isJsxTagName = (node: ESTree.Node): boolean =>
  node.type === "JSXIdentifier" &&
  (node.parent.type === "JSXOpeningElement" ||
    node.parent.type === "JSXClosingElement");

const isShorthandProperty = (node: ESTree.Node): boolean => {
  let { parent } = node;

  if (parent?.type === "AssignmentPattern" && parent.left === node) {
    ({ parent } = parent);
  }

  return parent?.type === "Property" && parent.shorthand;
};

/**
 * Text replacing the name at `node`. Expanding shorthand forms preserves the spelling of property keys, imported names and exported names.
 */
const replacementText = (
  node: ESTree.Node,
  name: string,
  newName: string,
): string => {
  const { parent } = node;

  if (
    parent?.type === "ImportSpecifier" &&
    parent.imported.range[0] === parent.local.range[0]
  ) {
    return `${name} as ${newName}`;
  }

  if (
    parent?.type === "ExportSpecifier" &&
    parent.exported.range[0] === parent.local.range[0]
  ) {
    return `${newName} as ${name}`;
  }

  if (isShorthandProperty(node)) {
    return `${name}: ${newName}`;
  }

  return newName;
};

/**
 * Edits renaming `variable` and every reference to it to `newName`, or `null` if the rename
 * could change behaviour or the module's interface.
 *
 * On success this function claims the new name for the rest of the lint pass. The caller must report the returned edits.
 */
const renameVariable = (
  sourceCode: SourceCode,
  variable: Variable,
  newName: string,
): Fix[] | null => {
  const rename: Rename = {
    name: newName,
    variables: declaredTogether(sourceCode, variable),
  };

  if (
    reservedNames.has(newName) ||
    ![...rename.variables].every((candidate) =>
      isRenameable(sourceCode, candidate),
    ) ||
    hasConflict(sourceCode, rename)
  ) {
    return null;
  }

  const nodes = nameNodes(rename);

  if (
    intrinsicJsxNamePattern.test(newName) &&
    nodes.some((node) => isJsxTagName(node))
  ) {
    return null;
  }

  const edits: Fix[] = [];

  for (const node of nodes) {
    // A binding identifier's range also covers its type annotation. Its first token is the name.
    const token = sourceCode.getFirstToken(node);

    if (token === null) {
      return null;
    }

    edits.push({
      range: token.range,
      text: replacementText(node, variable.name, newName),
    });
  }

  for (const candidate of rename.variables) {
    claimedNames.set(candidate, newName);
  }

  return edits;
};

// Mapped types attach their parameter definition to the mapped-type node.
const isTypeParameter = (variable: Variable): boolean =>
  variable.defs.some(
    (definition) =>
      definition.node.type === "TSTypeParameter" ||
      definition.node.type === "TSMappedType",
  );

const pascalCaseDeclarations: ReadonlySet<ESTree.Node["type"]> = new Set([
  "ClassDeclaration",
  "ClassExpression",
  "TSEnumDeclaration",
  "TSEnumMember",
  "TSInterfaceDeclaration",
  "TSModuleDeclaration",
  "TSTypeAliasDeclaration",
]);

// `const Foo = class {}` binds a class through a variable declaration.
const isClassBinding = (definition: Definition): boolean =>
  definition.node.type === "VariableDeclarator" &&
  definition.node.id.type === "Identifier" &&
  definition.node.init?.type === "ClassExpression";

/**
 * `const` bindings and function declarations may use PascalCase to signal a class-like or type-like role. Examples include React components, constructor functions and Effect schemas.
 */
const isFlexibleDefinition = (definition: Definition): boolean =>
  definition.node.type === "FunctionDeclaration" ||
  definition.node.type === "TSDeclareFunction" ||
  (definition.parent?.type === "VariableDeclaration" &&
    definition.parent.kind === "const");

const startsUpperPattern = /^[$_]*\p{Lu}/u;

type NamingPolicy = Casing | "camelCase or PascalCase";

/**
 * The casing `variable` must follow, or `null` if the rule does not govern its name.
 *
 * Types, classes, enums and namespaces are PascalCase, `const` bindings and function
 * declarations either camelCase or PascalCase, everything else camelCase. A value merged with a
 * type (`const Schema = ...` with `type Schema = ...`) follows the type. The exporting module chooses imported names. The author may rename them on import.
 */
const policyOf = (variable: Variable): NamingPolicy | null => {
  if (
    variable.defs.length === 0 ||
    variable.defs.some((definition) => definition.type === "ImportBinding")
  ) {
    return null;
  }

  if (
    isTypeParameter(variable) ||
    variable.defs.some(
      (definition) =>
        pascalCaseDeclarations.has(definition.node.type) ||
        isClassBinding(definition),
    )
  ) {
    return "PascalCase";
  }

  if (variable.defs.every((definition) => isFlexibleDefinition(definition))) {
    return "camelCase or PascalCase";
  }

  return "camelCase";
};

const conformsTo = (name: string, policy: NamingPolicy): boolean => {
  if (policy === "camelCase or PascalCase") {
    return isCase(name, "camelCase") || isCase(name, "PascalCase");
  }

  return isCase(name, policy);
};

/** The target casing. A flexible name keeps the case of its first letter. */
const targetCasing = (name: string, policy: NamingPolicy): Casing => {
  if (policy !== "camelCase or PascalCase") {
    return policy;
  }

  if (startsUpperPattern.test(name)) {
    return "PascalCase";
  }

  return "camelCase";
};

const messageIdOf = (
  casing: Casing | null,
  affix: KindAffixMatch | null,
): "casing" | "casingAndKindAffix" | "kindAffix" => {
  if (affix === null) {
    return "casing";
  }

  if (casing === null) {
    return "kindAffix";
  }

  return "casingAndKindAffix";
};

const checkVariable = (context: Context, variable: Variable): void => {
  const [identifier] = variable.identifiers;
  const policy = policyOf(variable);

  if (identifier === undefined || policy === null) {
    return;
  }

  let casing: Casing | null = null;
  let cased = variable.name;
  let affix: KindAffixMatch | null = null;

  if (!conformsTo(variable.name, policy)) {
    casing = targetCasing(variable.name, policy);
    cased = toCase(variable.name, casing);
  }

  // Single-letter prefixes are the convention for type parameters (`TValue`, `EIn`, `RIn`).
  // Checking the converted name removes both the `_` separator and the `I` prefix from `I_user`.
  if (!isTypeParameter(variable)) {
    affix = findKindAffix(cased);
  }

  if (casing === null && affix === null) {
    return;
  }

  const expected = affix?.expected ?? cased;
  let edits: Fix[] | null = null;

  // Conversions can fail to conform, e.g. `foo_a_bar` becomes `fooABar`, which may violate the naming policy.
  if (expected !== variable.name && conformsTo(expected, policy)) {
    edits = renameVariable(context.sourceCode, variable, expected);
  }

  context.report({
    data: { ...affix, casing: policy, expected, name: variable.name },
    fix: () => edits,
    messageId: messageIdOf(casing, affix),
    node: identifier,
  });
};

export const namingConventions = defineRule({
  createOnce: (context) => ({
    "Program:exit": (): void => {
      const checked = new Set<number>();

      for (const scope of context.sourceCode.scopeManager.scopes) {
        for (const variable of scope.variables) {
          const [identifier] = variable.identifiers;

          if (identifier !== undefined && !checked.has(identifier.range[0])) {
            checked.add(identifier.range[0]);
            checkVariable(context, variable);
          }
        }
      }
    },
  }),
  meta: {
    fixable: "code",
    messages: {
      casing: 'Rename "{{name}}" to "{{expected}}" ({{casing}}).',
      casingAndKindAffix:
        'Rename "{{name}}" to "{{expected}}" ({{casing}}). The {{affix}} {{position}} restates what kind of declaration it is, which is the job of TypeScript.',
      kindAffix:
        'Rename "{{name}}" to "{{expected}}". The {{affix}} {{position}} restates what kind of declaration it is, which is the job of TypeScript.',
    },
    type: "suggestion",
  },
});
