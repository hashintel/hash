import {
  StandardTags,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";

import type { DocBlockTag } from "@microsoft/tsdoc";

/** The package's TSDoc configuration must define the non-standard tags below, or TSDoc reports them as undefined before parsing reaches them. */
export const since = new TSDocTagDefinition({
  tagName: "@since",
  syntaxKind: TSDocTagSyntaxKind.BlockTag,
});

export const category = new TSDocTagDefinition({
  tagName: "@category",
  syntaxKind: TSDocTagSyntaxKind.BlockTag,
});

export const stability = new TSDocTagDefinition({
  tagName: "@stability",
  syntaxKind: TSDocTagSyntaxKind.BlockTag,
});

export const trait = new TSDocTagDefinition({
  tagName: "@trait",
  syntaxKind: TSDocTagSyntaxKind.ModifierTag,
});

/** Named apart from the others because `module` is CommonJS's module object. */
export const moduleTag = new TSDocTagDefinition({
  tagName: "@module",
  syntaxKind: TSDocTagSyntaxKind.ModifierTag,
});

export const { example, throws, internal } = StandardTags;

/** TSDoc matches tag names without regard to case, so a tag written as `@Since` is still `@since`. */
export const is =
  (definition: TSDocTagDefinition) =>
  (tag: DocBlockTag): boolean =>
    tag.tagNameWithUpperCase === definition.tagNameWithUpperCase;
