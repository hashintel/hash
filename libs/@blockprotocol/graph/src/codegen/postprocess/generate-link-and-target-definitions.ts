import type { VersionedUrl } from "@blockprotocol/type-system/slim";

import { mustBeDefined } from "../../shared/util/must-be-defined.js";
import {
  typedEntries,
  typedValues,
} from "../../shared/util/typed-object-iter.js";
import type { PostprocessContext } from "../context/postprocess.js";
import { entityDefinitionNameForEntityType } from "../shared";

type IdentifierToCompiledDefinition = {
  identifier: string;
  compiledContents: string;
  dependentOnIdentifiers: string[];
};

/**
 * Create the individual definition of a `LinkAndTargetEntity` for a given outgoing link from a source
 *
 * @param sourceName
 * @param linkIdentifier
 * @param targetIdentifiers
 */
const individualOutgoingLinkAndTargetDefinition = (
  sourceName: string,
  linkIdentifier: string,
  targetIdentifiers: [string, ...string[]],
): IdentifierToCompiledDefinition => {
  const identifier = `${sourceName}${linkIdentifier}Link`;

  const targetUnion = targetIdentifiers.join(" | ");
  const compiledContents = `export type ${identifier} = { linkEntity: ${linkIdentifier}; rightEntity: ${targetUnion} }`;
  return {
    identifier,
    compiledContents,
    dependentOnIdentifiers: [linkIdentifier, ...targetIdentifiers],
  };
};

/**
 * Create a lookup map of a link entity type ID to its associated link and target definition
 *
 * @param entityName
 * @param linkEntityTypeIdToLinkAndTargetIdentifiers
 */
const lookupDefinition = (
  entityName: string,
  linkEntityTypeIdToLinkAndTargetIdentifiers: Record<VersionedUrl, string>,
): IdentifierToCompiledDefinition => {
  const identifier = `${entityName}OutgoingLinksByLinkEntityTypeId`;

  const lookupItems = typedEntries(linkEntityTypeIdToLinkAndTargetIdentifiers)
    .map(([linkEntityTypeId, linkAndTargetIdentifier]) => {
      return `"${linkEntityTypeId}": ${linkAndTargetIdentifier}`;
    })
    .join(", ");

  const compiledContents = `export type ${identifier} = { ${lookupItems} }`;

  return {
    identifier,
    compiledContents,
    dependentOnIdentifiers: typedValues(
      linkEntityTypeIdToLinkAndTargetIdentifiers,
    ),
  };
};

/**
 * Generates the union of all outgoing link and target definitions for a given entity
 *
 * @param entityName
 * @param linkAndTargetIdentifiers
 */
const linkAndTargetsUnionDefinition = (
  entityName: string,
  linkAndTargetIdentifiers: string[],
): IdentifierToCompiledDefinition => {
  const identifier = `${entityName}OutgoingLinkAndTarget`;
  const unionItems =
    linkAndTargetIdentifiers.length > 0
      ? linkAndTargetIdentifiers.join(" | ")
      : "never";
  const compiledContents = `export type ${identifier} = ${unionItems}`;

  return {
    identifier,
    compiledContents,
    dependentOnIdentifiers: linkAndTargetIdentifiers,
  };
};

/**
 * Generates definitions associated with the outgoing links and their targets of a given entity
 *
 * @param entityName
 * @param entityTypeId
 * @param context
 */
const generateOutgoingLinkAndTargetDefinitionsForEntity = (
  entityName: string,
  entityTypeId: VersionedUrl,
  context: PostprocessContext,
) => {
  const entityType = mustBeDefined(context.entityTypes[entityTypeId]);

  const mappedLinkAndTargetIdentifiers: Record<
    VersionedUrl,
    { linkIdentifier: string; targetIdentifiers: string[] }
  > = {};

  for (const [linkTypeId, targetEntityTypeRefs] of typedEntries(
    entityType.links ?? {},
  )) {
    const linkEntityIdentifier = entityDefinitionNameForEntityType(
      mustBeDefined(context.entityTypes[linkTypeId]).title,
    );

    mappedLinkAndTargetIdentifiers[linkTypeId] ??= {
      linkIdentifier: linkEntityIdentifier,
      targetIdentifiers: [],
    };
    const targetIdentifiers =
      mappedLinkAndTargetIdentifiers[linkTypeId]!.targetIdentifiers;

    if ("oneOf" in targetEntityTypeRefs.items) {
      for (const targetEntityTypeRef of targetEntityTypeRefs.items.oneOf) {
        const targetEntityType = mustBeDefined(
          context.entityTypes[targetEntityTypeRef.$ref],
        );

        targetIdentifiers.push(
          entityDefinitionNameForEntityType(targetEntityType.title),
        );
      }
    } else {
      // Unconstrained link destination, allow any entity
      targetIdentifiers.push("Entity");
    }
  }

  const linkTypeIdsTolinkAndTargets = Object.fromEntries(
    typedEntries(mappedLinkAndTargetIdentifiers).map(
      ([linkTypeId, { linkIdentifier, targetIdentifiers }]) => {
        if (targetIdentifiers.length === 0) {
          throw new Error(
            `Internal error, no target identifiers for link entity ${linkIdentifier}`,
          );
        }
        return [
          linkTypeId,
          individualOutgoingLinkAndTargetDefinition(
            entityName,
            linkIdentifier,
            targetIdentifiers as [string, ...string[]],
          ),
        ];
      },
    ),
  );

  const linkEntityTypeIdsToLinkAndTargetIdentifiers = Object.fromEntries(
    typedEntries(linkTypeIdsTolinkAndTargets).map(
      ([linkTypeId, { identifier }]) => [linkTypeId, identifier],
    ),
  );

  const lookup = lookupDefinition(
    entityName,
    linkEntityTypeIdsToLinkAndTargetIdentifiers,
  );

  const linkAndTargets = typedValues(linkTypeIdsTolinkAndTargets);
  const linkAndTargetIdentifiers = linkAndTargets.map(
    ({ identifier }) => identifier,
  );

  const linkAndTargetsUnion = linkAndTargetsUnionDefinition(
    entityName,
    linkAndTargetIdentifiers,
  );

  return {
    entityName,
    lookup,
    linkAndTargetsUnion,
    linkAndTargets,
  };
};

const allocateOutgoingLinkAndTargetDefinitionsToFile = (
  fileName: string,
  entityName: string,
  definitions: {
    identifier: string;
    compiledContents: string;
    dependentOnIdentifiers: string[];
  }[],
  context: PostprocessContext,
) => {
  context.logTrace(
    `Adding outgoing link and target definitions for ${entityName}`,
  );

  for (const {
    identifier,
    compiledContents,
    dependentOnIdentifiers,
  } of definitions) {
    context.defineIdentifierInFile(
      identifier,
      {
        definingPath: fileName,
        compiledContents,
        dependentOnIdentifiers,
      },
      true,
    );
  }
};

/**
 * Generates types for the definition of various associated `LinkEntityAndTarget` `Entity` kinds, alongside their entity type definitions.
 *
 * @param context
 */
export const generateLinkAndTargetDefinitions = (
  context: PostprocessContext,
): void => {
  context.logDebug("Adding entity link and target definitions");

  const entityTypeIdentifiersToIds = Object.fromEntries(
    typedEntries(context.entityTypes).map(([entityTypeId, { title }]) => [
      title,
      entityTypeId,
    ]),
  );

  const entityTypeIdsToOutgoingLinkAndTargetDefinitions = Object.fromEntries(
    typedEntries(context.entityTypes).map(([entityTypeId, { title }]) => {
      const entityName = entityDefinitionNameForEntityType(title);

      return [
        entityTypeId,
        generateOutgoingLinkAndTargetDefinitionsForEntity(
          entityName,
          entityTypeId,
          context,
        ),
      ];
    }),
  );

  for (const [file, dependentIdentifiers] of typedEntries(
    context.filesToDependentIdentifiers,
  )) {
    for (const dependentIdentifier of dependentIdentifiers) {
      const entityTypeId = entityTypeIdentifiersToIds[dependentIdentifier];
      if (entityTypeId) {
        const { entityName, lookup, linkAndTargets, linkAndTargetsUnion } =
          mustBeDefined(
            entityTypeIdsToOutgoingLinkAndTargetDefinitions[entityTypeId],
          );

        if (context.filesToDefinedIdentifiers[file]?.has(dependentIdentifier)) {
          allocateOutgoingLinkAndTargetDefinitionsToFile(
            file,
            entityName,
            [lookup, linkAndTargetsUnion, ...linkAndTargets],
            context,
          );
        } else {
          for (const { identifier } of [
            lookup,
            linkAndTargetsUnion,
            ...linkAndTargets,
          ]) {
            context.addDependentIdentifierInFile(identifier, file);
          }
        }
      }
    }
  }
};
