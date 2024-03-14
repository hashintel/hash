import type {
  BaseUrl,
  DataType,
  EntityType,
  PropertyType,
} from "@blockprotocol/type-system/slim";
import {
  extractBaseUrl,
  extractVersion,
} from "@blockprotocol/type-system/slim";
import ts from "typescript";

import { mustBeDefined } from "../../shared/util/must-be-defined.js";
import {
  typedEntries,
  typedKeys,
} from "../../shared/util/typed-object-iter.js";
import type { PreprocessContext } from "../context.js";
import { generatedTypeSuffix } from "../shared.js";

const typescriptKeywords = new Array(
  ts.SyntaxKind.LastKeyword - ts.SyntaxKind.FirstKeyword,
)
  .fill(0)
  .map((_, idx) => ts.tokenToString(ts.SyntaxKind.FirstKeyword + idx)!);

const isTypescriptKeyword = (name: string) => {
  return typescriptKeywords.includes(name);
};

/**
 * Extracts the alphanumeric characters from the title and creates a Title Cased version that can be used as a
 * TypeScript identifier
 *
 * @param title
 */
const generateValidTypeScriptIdentifierFromTitle = (title: string): string => {
  /* @todo - Handle acronyms, we should do a non-case-sensitive match and then convert all the groups to lower-case */
  // extract all letters and numbers from the title, and capitalise the start of each component
  const pascalCase = (title.match(/[a-zA-Z0-9]+/g) ?? [])
    .map((word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");

  const typeName = !/[a-zA-Z]/.test(pascalCase.charAt(0))
    ? `T${pascalCase}`
    : pascalCase;

  if (isTypescriptKeyword(typeName)) {
    throw new Error(
      `Internal error: generated type name "${typeName}" is a TypeScript keyword`,
    );
  }

  return typeName;
};

/**
 * **Rewrites** the `title`s of the types to be locally (per file) unique valid javascript identifiers.
 *
 * Clashes are dealt with per class of type, and then per Base Url, and then per revision.
 */
export const rewriteTypeTitles = (context: PreprocessContext) => {
  context.logDebug("Rewriting type titles to be unique...");

  const typeNamesToTypes: {
    dataType: Record<string, DataType[]>;
    propertyType: Record<string, PropertyType[]>;
    entityType: Record<string, EntityType[]>;
  } = {
    dataType: {},
    propertyType: {},
    entityType: {},
  };

  const typeNameOverrides = context.parameters.typeNameOverrides;

  for (const [typeId, type] of typedEntries(context.allTypes)) {
    const override = typeNameOverrides[typeId];
    const typeNameFromTitle = generateValidTypeScriptIdentifierFromTitle(
      override ?? type.title,
    );

    if (override && typeNameFromTitle !== override) {
      context.logWarn(
        `Type name override of "${override}" for "${typeId}" isn't in PascalCase, using "${typeNameFromTitle}" instead.`,
      );
    }

    typeNamesToTypes[type.kind][typeNameFromTitle] ??= [];
    // @ts-expect-error –– this is safe as we just checked the `kind`
    typeNamesToTypes[type.kind][typeNameFromTitle]!.push(type);
  }

  for (const [typeKind, nameMap] of typedEntries(typeNamesToTypes)) {
    for (const [typeName, typesForName] of typedEntries(nameMap)) {
      if (typesForName.length > 1) {
        // Group them by their BaseUrl
        const baseUrlToTypes: Record<BaseUrl, typeof typesForName> = {};

        for (const type of typesForName) {
          const baseUrl = extractBaseUrl(type.$id);
          baseUrlToTypes[baseUrl] ??= [];
          // @ts-expect-error ––  This `any` is safe as we're literally passing the same type back in, TS is just confused by the disjoint
          // union of `DataType[] | PropertyType[] | EntityType[]`
          baseUrlToTypes[baseUrl]!.push(type);
        }

        if (typedKeys(baseUrlToTypes).length > 1) {
          // They're not all the same BaseUrl so we need to differentiate the different types, and then the different
          // revisions of the types

          // We want this process to be deterministic so we sort by Base URL
          const baseUrlToTypesEntries = typedEntries(baseUrlToTypes);
          (baseUrlToTypesEntries as [BaseUrl, any][]).sort(
            ([baseUrlA, _A], [baseUrlB, _B]) =>
              baseUrlA.localeCompare(baseUrlB),
          );

          /* @todo - Add option to pass in a named capture-group regex which can extract more components */
          for (const [
            index,
            [_baseUrl, typesOfBaseUrl],
          ] of baseUrlToTypesEntries.entries()) {
            if (typesOfBaseUrl.length > 1) {
              for (const currentTypeRevision of typesOfBaseUrl) {
                // We have multiple revisions of this type, so we need to differentiate it from the other types with the
                // same title, and then also from its other revisions
                currentTypeRevision.title = `${typeName}${index}V${extractVersion(
                  currentTypeRevision.$id,
                )}`;
              }
            } else {
              // We only have one revision of this type, so we only need to differentiate it from the other types with
              // the same title
              mustBeDefined(typesOfBaseUrl[0]).title = `${typeName}${index}`;
            }
          }
        } else {
          // They're all revisions of the same type (same Base URL) so we can just differentiate them by their version
          for (const type of mustBeDefined(
            Object.values(baseUrlToTypes).pop(),
          )) {
            type.title = `${typeName}V${extractVersion(type.$id)}`;
          }
        }
      } else {
        mustBeDefined(typesForName[0]).title = typeName;
      }

      for (const type of typesForName) {
        type.title += generatedTypeSuffix[typeKind];
        if (isTypescriptKeyword(type.title)) {
          type.title += "Type";
        }
        context.logTrace(`Renamed the title of ${type.$id} to ${type.title}`);
      }
    }
  }
};
