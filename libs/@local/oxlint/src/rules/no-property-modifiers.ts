/**
 * Prefers JavaScript private names and default public visibility.
 *
 * Reports accessibility modifiers on fields, auto-accessors and constructor parameter properties. Methods report only public and private modifiers. Private and protected constructors remain valid.
 *
 * Fixes remove redundant public modifiers and can rewrite private fields and recognized accesses to #names. Private methods have no fix. Private-name conversion changes enumeration and serialization. Protected properties and unsupported conversions need manual edits.
 *
 * @example Incorrect
 * ```ts
 * class Counter { public count = 0; }
 * ```
 *
 * @example Correct
 * ```ts
 * class Counter { count = 0; }
 * ```
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

import type { Context, ESTree, Fix, SourceCode, Token } from "@oxlint/plugins";

type ClassProperty = ESTree.PropertyDefinition | ESTree.AccessorProperty;

type ClassMemberProperty = ClassProperty & {
  readonly parent: ESTree.ClassBody;
};

interface ThisOwner {
  readonly body: ESTree.ClassBody;
  readonly isStatic: boolean;
}

/** Nodes retained until traversal of the whole file finishes. */
interface FileState {
  readonly classBodies: ESTree.ClassBody[];
  readonly memberExpressions: ESTree.StaticMemberExpression[];
  readonly patternKeys: ESTree.IdentifierName[];
  /** Names accessed in ways a private name cannot be, such as `this["foo"]` or `typeof this.foo`. */
  readonly unrenameableNames: Set<string>;
}

const isClassMember = (
  property: ClassProperty,
): property is ClassMemberProperty => property.parent.type === "ClassBody";

const isStaticMember = (
  node: ESTree.MemberExpression,
): node is ESTree.StaticMemberExpression =>
  !node.computed && node.property.type === "Identifier";

const isClassProperty = (
  element: ESTree.ClassElement,
): element is ClassProperty =>
  element.type === "PropertyDefinition" ||
  element.type === "TSAbstractPropertyDefinition" ||
  element.type === "AccessorProperty" ||
  element.type === "TSAbstractAccessorProperty";

const elementName = (element: ESTree.ClassElement): string | null => {
  if (
    element.type === "StaticBlock" ||
    element.type === "TSIndexSignature" ||
    element.computed
  ) {
    return null;
  }

  if (
    element.key.type === "Identifier" ||
    element.key.type === "PrivateIdentifier"
  ) {
    return element.key.name;
  }

  return null;
};

const addStringKey = (state: FileState, node: ESTree.Node): void => {
  if (node.type === "Literal" && typeof node.value === "string") {
    state.unrenameableNames.add(node.value);
  }
};

const methodOwner = (method: ESTree.Function): ThisOwner | null => {
  const { parent } = method;

  if (
    (parent.type === "MethodDefinition" ||
      parent.type === "TSAbstractMethodDefinition") &&
    parent.value === method &&
    parent.parent.type === "ClassBody"
  ) {
    return { body: parent.parent, isStatic: parent.static };
  }

  return null;
};

/** The class and context (static or instance) that `this` refers to at `node`. */
const thisOwner = (node: ESTree.ThisExpression): ThisOwner | null => {
  let child: ESTree.Node = node;

  for (
    let current: ESTree.Node | null = node.parent;
    current !== null;
    current = current.parent
  ) {
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression"
    ) {
      return methodOwner(current);
    }

    if (current.type === "StaticBlock" && current.parent.type === "ClassBody") {
      return { body: current.parent, isStatic: true };
    }

    // Only initializers use the class's `this`. Computed keys use the enclosing context.
    if (
      (current.type === "PropertyDefinition" ||
        current.type === "AccessorProperty") &&
      current.value === child &&
      current.parent.type === "ClassBody"
    ) {
      return { body: current.parent, isStatic: current.static };
    }

    child = current;
  }

  return null;
};

const refersToClass = (
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference,
  body: ESTree.ClassBody,
): boolean => {
  const reference = sourceCode
    .getScope(identifier)
    .references.find((candidate) => candidate.identifier === identifier);

  return (
    reference?.resolved?.defs.some(
      (definition) => definition.node === body.parent,
    ) === true
  );
};

/** Whether `member` resolves to `property` within its declaring class. */
const accessesProperty = (
  sourceCode: SourceCode,
  member: ESTree.StaticMemberExpression,
  property: ClassMemberProperty,
): boolean => {
  // JavaScript forbids deleting private names.
  if (
    member.parent.type === "UnaryExpression" &&
    member.parent.operator === "delete"
  ) {
    return false;
  }

  if (member.object.type === "ThisExpression") {
    const owner = thisOwner(member.object);

    return (
      owner?.body === property.parent && owner.isStatic === property.static
    );
  }

  return (
    property.static &&
    member.object.type === "Identifier" &&
    refersToClass(sourceCode, member.object, property.parent)
  );
};

type AccessibleMember =
  | ClassProperty
  | ESTree.MethodDefinition
  | ESTree.TSParameterProperty;

const modifierToken = (
  sourceCode: SourceCode,
  node: AccessibleMember,
  modifier: ESTree.TSAccessibility,
): Token | null => {
  const lastDecorator = node.decorators.at(-1);
  const start = lastDecorator?.range[1] ?? node.range[0];

  return sourceCode.getFirstToken(node, {
    filter: (token) => token.range[0] >= start && token.value === modifier,
  });
};

/** Removes `modifier` and the whitespace after it from `node`. */
const modifierRemoval = (
  sourceCode: SourceCode,
  node: AccessibleMember,
  modifier: ESTree.TSAccessibility,
): Fix | null => {
  const token = modifierToken(sourceCode, node, modifier);

  if (token === null) {
    return null;
  }

  const next = sourceCode.getTokenAfter(token, { includeComments: true });
  const nextValue = sourceCode.getTokenAfter(token)?.value;

  // A leading `[` or `*` could continue the previous field's initializer after removal.
  if (next === null || nextValue === "[" || nextValue === "*") {
    return null;
  }

  return { range: [token.range[0], next.range[0]], text: "" };
};

const isWithin = (node: ESTree.Node, container: ESTree.Node): boolean =>
  node.range[0] >= container.range[0] && node.range[1] <= container.range[1];

const isAmbient = (node: ESTree.Node): boolean => {
  for (
    let current: ESTree.Node | null = node;
    current !== null;
    current = current.parent
  ) {
    if ("declare" in current && current.declare) {
      return true;
    }
  }

  return false;
};

/** Whether the property's declaration and recorded uses permit a private `name`. */
const canUsePrivateName = (
  state: FileState,
  property: ClassMemberProperty,
  name: string,
): boolean =>
  // Private names cannot be optional, decorated by legacy decorators, or ambient.
  (property.type === "PropertyDefinition" ||
    property.type === "AccessorProperty") &&
  property.optional !== true &&
  property.decorators.length === 0 &&
  !isAmbient(property) &&
  !state.unrenameableNames.has(name) &&
  !property.parent.body.some(
    (element) => element !== property && elementName(element) === name,
  ) &&
  !state.patternKeys.some(
    (key) => key.name === name && isWithin(key, property.parent),
  );

/**
 * Edits turning the `private` property into a private name (`#name`), or `null` if the rule cannot establish a rewrite for every access.
 */
const privateNameFix = (
  sourceCode: SourceCode,
  state: FileState,
  property: ClassProperty,
): Fix[] | null => {
  const name = elementName(property);

  if (
    !isClassMember(property) ||
    name === null ||
    !canUsePrivateName(state, property, name)
  ) {
    return null;
  }

  // TypeScript only allows access to a private property from within its class.
  const accesses = state.memberExpressions.filter(
    (member) =>
      member.property.name === name && isWithin(member, property.parent),
  );
  const removal = modifierRemoval(sourceCode, property, "private");

  if (
    removal === null ||
    !accesses.every((member) => accessesProperty(sourceCode, member, property))
  ) {
    return null;
  }

  return [
    removal,
    { range: property.key.range, text: `#${name}` },
    ...accesses.map(
      (member): Fix => ({ range: member.property.range, text: `#${name}` }),
    ),
  ];
};

const checkProperty = (
  context: Context,
  state: FileState,
  property: ClassProperty,
): void => {
  const { accessibility } = property;

  if (accessibility === undefined || accessibility === null) {
    return;
  }

  let edits: Fix[] | Fix | null = null;

  if (accessibility === "private") {
    edits = privateNameFix(context.sourceCode, state, property);
  } else if (accessibility === "public") {
    // Properties are public by default.
    edits = modifierRemoval(context.sourceCode, property, accessibility);
  }

  context.report({
    data: { name: context.sourceCode.getText(property.key) },
    fix: () => edits,
    messageId: accessibility,
    node:
      modifierToken(context.sourceCode, property, accessibility) ?? property,
  });
};

/**
 * Removes only `public`, and only while `readonly` or `override` keeps the parameter a property. The author must handle conversion to a field and an assignment.
 */
const checkParameterProperty = (
  context: Context,
  property: ESTree.TSParameterProperty,
): void => {
  const { accessibility, parameter } = property;

  if (accessibility === null) {
    return;
  }

  let binding: ESTree.Node = parameter;
  let edit: Fix | null = null;

  if (parameter.type === "AssignmentPattern") {
    binding = parameter.left;
  }

  if (accessibility === "public" && (property.readonly || property.override)) {
    edit = modifierRemoval(context.sourceCode, property, accessibility);
  }

  context.report({
    data: {
      name: context.sourceCode.getText(
        context.sourceCode.getFirstToken(binding),
      ),
    },
    fix: () => edit,
    messageId: accessibility,
    node:
      modifierToken(context.sourceCode, property, accessibility) ?? property,
  });
};

const checkMethod = (
  context: Context,
  method: ESTree.MethodDefinition,
): void => {
  const { accessibility, kind } = method;

  if (
    accessibility !== "public" &&
    (accessibility !== "private" || kind === "constructor")
  ) {
    return;
  }

  let edit: Fix | null = null;
  if (accessibility === "public") {
    edit = modifierRemoval(context.sourceCode, method, accessibility);
  }

  context.report({
    data: { name: context.sourceCode.getText(method.key) },
    fix: () => edit,
    messageId: accessibility,
    node: modifierToken(context.sourceCode, method, accessibility) ?? method,
  });
};

export const noPropertyModifiers = defineRule({
  createOnce: (context) => {
    const state: FileState = {
      classBodies: [],
      memberExpressions: [],
      patternKeys: [],
      unrenameableNames: new Set(),
    };

    return {
      BinaryExpression: (node): void => {
        if (node.operator === "in") {
          addStringKey(state, node.left);
        }
      },
      ClassBody: (node): void => {
        state.classBodies.push(node);
      },
      MemberExpression: (node): void => {
        if (node.computed) {
          addStringKey(state, node.property);
        } else if (isStaticMember(node)) {
          state.memberExpressions.push(node);
        }
      },
      MethodDefinition: (node): void => {
        checkMethod(context, node);
      },
      "Program:exit": (): void => {
        for (const body of state.classBodies) {
          for (const property of body.body.filter(isClassProperty)) {
            checkProperty(context, state, property);
          }
        }
      },
      Property: (node): void => {
        if (
          node.parent.type === "ObjectPattern" &&
          !node.computed &&
          node.key.type === "Identifier"
        ) {
          state.patternKeys.push(node.key);
        }
      },
      TSAbstractMethodDefinition: (node): void => {
        checkMethod(context, node);
      },
      TSIndexedAccessType: (node): void => {
        if (node.indexType.type === "TSLiteralType") {
          addStringKey(state, node.indexType.literal);
        }
      },
      TSParameterProperty: (node): void => {
        checkParameterProperty(context, node);
      },
      TSQualifiedName: (node): void => {
        if (node.left.type === "ThisExpression") {
          state.unrenameableNames.add(node.right.name);
        }
      },
      before: (): void => {
        state.classBodies.length = 0;
        state.memberExpressions.length = 0;
        state.patternKeys.length = 0;
        state.unrenameableNames.clear();
      },
    };
  },
  meta: {
    fixable: "code",
    messages: {
      private:
        'Use a private name ("#{{name}}") instead of the `private` modifier on "{{name}}".',
      protected: 'Remove the `protected` modifier from property "{{name}}".',
      public: 'Remove the `public` modifier from "{{name}}".',
    },
    type: "suggestion",
  },
});
