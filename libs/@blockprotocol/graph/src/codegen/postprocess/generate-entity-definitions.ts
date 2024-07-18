import type { VersionedUrl } from "@blockprotocol/type-system/slim";

import { mustBeDefined } from "../../util/must-be-defined";
import { typedEntries } from "../../util/typed-object-iter";
import type { PostprocessContext } from "../context/postprocess";
import { entityDefinitionNameForEntityType } from "../shared";

const generateEntityDefinitionForEntityType = (
  entityTypeId: VersionedUrl,
  title: string,
  context: PostprocessContext,
) => {
  const typeName = title;
  const isLinkType = mustBeDefined(context.linkTypeMap[entityTypeId]);
  const type = mustBeDefined(context.entityTypes[entityTypeId]);

  const entityName = entityDefinitionNameForEntityType(typeName);

  const compiledContents = `\n/**
  * ${type.description}
  */
  export type ${entityName} = {
  entityTypeId: "${entityTypeId}";
  properties: ${typeName};
  propertiesWithMetadata: ${typeName}WithMetadata;
}\n`;

  return { entityName, isLinkType, compiledContents };
};

const allocateEntityDefinitionToFile = (
  fileName: string,
  entityName: string,
  compiledContents: string,
  context: PostprocessContext,
) => {
  context.logTrace(`Adding entity definition for ${entityName}`);

  context.defineIdentifierInFile(
    entityName,
    {
      definingPath: fileName,
      dependentOnIdentifiers: [],
      compiledContents,
    },
    true,
  );
};

/**
 * Generates types for the definition of various `Entity` kinds, alongside their entity type definitions.
 *
 * @param context
 */
export const generateEntityDefinitions = (
  context: PostprocessContext,
): void => {
  context.logDebug("Adding entity definitions");

  const entityTypeIdentifiersToIds = Object.fromEntries(
    typedEntries(context.entityTypes).map(([entityTypeId, { title }]) => [
      title,
      entityTypeId,
    ]),
  );

  const entityTypeIdsToEntityDefinitions = Object.fromEntries(
    typedEntries(context.entityTypes).map(([entityTypeId, { title }]) => {
      return [
        entityTypeId,
        generateEntityDefinitionForEntityType(entityTypeId, title, context),
      ];
    }),
  );

  for (const [file, dependentIdentifiers] of typedEntries(
    context.filesToDependentIdentifiers,
  )) {
    for (const identifier of dependentIdentifiers) {
      const entityTypeId = entityTypeIdentifiersToIds[identifier];
      if (entityTypeId) {
        const { entityName, compiledContents } = mustBeDefined(
          entityTypeIdsToEntityDefinitions[entityTypeId],
        );

        if (context.filesToDefinedIdentifiers[file]?.has(identifier)) {
          allocateEntityDefinitionToFile(
            file,
            entityName,
            compiledContents,
            context,
          );
        } else {
          context.addDependentIdentifierInFile(entityName, file);
        }
      }
    }
  }
};
