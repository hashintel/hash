import {
  BlockProtocolAggregateFn,
  BlockProtocolEntity,
  BlockProtocolLink,
  BlockProtocolLinkGroup,
} from "@hashintel/block-protocol";
import { useCallback, useMemo, VoidFunctionComponent } from "react";
import { tw } from "twind";

import {
  CreateLinkFnWithFixedSource,
  DeleteLinkFnWithFixedSource,
  EntityLinkDefinition,
} from "./types";
import { EntitySelect } from "./EntitySelect";
import { entityName } from "../../lib/entities";
import { isNonNullable } from "../../lib/typeguards";

type EntityLinkEditorProps = {
  aggregateEntity: BlockProtocolAggregateFn;
  createLinkFromEntity: CreateLinkFnWithFixedSource;
  deleteLinkFromEntity: DeleteLinkFnWithFixedSource;
  existingLinkGroups: BlockProtocolLinkGroup[];
  linkedEntities: BlockProtocolEntity[];
  linksInSchema: EntityLinkDefinition[];
  refetchEntity: () => void;
};

const pathToString = (pathAsArray: string[]) => pathAsArray.join(".");

export const EntityLinkEditor: VoidFunctionComponent<EntityLinkEditorProps> = ({
  aggregateEntity,
  createLinkFromEntity,
  deleteLinkFromEntity,
  existingLinkGroups,
  linkedEntities,
  linksInSchema,
  refetchEntity,
}) => {
  const linksByPath = useMemo(
    () =>
      linksInSchema.map((link) => ({
        ...link,
        // @todo associate link index with these when updating for link pagination.
        linkedEntities:
          existingLinkGroups
            .find(({ path }) => path === link.path.join("."))
            ?.links.map(({ destinationEntityId, destinationEntityVersionId }) =>
              linkedEntities.find(
                ({ entityId, entityVersionId }) =>
                  destinationEntityId === entityId &&
                  destinationEntityVersionId === entityVersionId,
              ),
            )
            .filter(isNonNullable) ?? [],
      })),
    [existingLinkGroups, linksInSchema, linkedEntities],
  );

  const setLinkedEntities = useCallback(
    async (
      pathString: string,
      linkedEntitiesToSet: { accountId: string; entityId: string }[],
    ) => {
      const oldLinkedEntities = linksByPath.find(
        ({ path }) => pathToString(path) === pathString,
      )?.linkedEntities;

      // @todo we should have an easier way of batch updating links via the API
      await Promise.all<boolean | null | BlockProtocolLink>([
        // Compare the list of new and old linked entities and replace links where they differ
        ...linkedEntitiesToSet.map(async (newEntity, index) => {
          const entityCurrentlyInLinkPosition = oldLinkedEntities?.[index];
          if (entityCurrentlyInLinkPosition?.entityId !== newEntity.entityId) {
            // @todo update when links can be deleted by id, and we don't have to delete before creating
            if (entityCurrentlyInLinkPosition) {
              await deleteLinkFromEntity({ index, path: pathString });
            }
            return createLinkFromEntity({
              index,
              path: pathString,
              destinationEntityId: newEntity.entityId,
            });
          }
          return null;
        }),
        // Delete any old links that were in positions beyond the new collection
        ...(oldLinkedEntities ?? [])
          .slice(linkedEntitiesToSet.length)
          /**
           * @todo handle larger link sets where we don't have them all available at once
           *    - once the links coming from the API are paginated. Figure out updating indices.
           */
          .map((_, index) =>
            deleteLinkFromEntity({
              path: pathString,
              index: linkedEntitiesToSet.length + index,
            }),
          ),
      ]);

      refetchEntity();
    },
    [createLinkFromEntity, deleteLinkFromEntity, linksByPath, refetchEntity],
  );

  return (
    <div>
      {linksByPath.map((link) => {
        const pathString = pathToString(link.path);
        return (
          <div className={tw`mb-8`} key={pathString}>
            <div className={tw`font-semibold mb-2`}>
              {pathString.replace(/^\$\./, "")}
            </div>
            <EntitySelect
              aggregate={aggregateEntity}
              entityTypeId={link.permittedTypeIds[0]} // @todo handle multiple permitted types
              allowsMultipleSelections={!!link.array}
              selectedEntities={link.linkedEntities.map(
                ({ accountId, entityId, properties }) => ({
                  accountId,
                  entityId,
                  name: entityName({ entityId, properties }),
                }),
              )}
              setSelectedEntities={(
                entities: { accountId: string; entityId: string }[],
              ) => setLinkedEntities(pathString, entities)}
            />
          </div>
        );
      })}
    </div>
  );
};
