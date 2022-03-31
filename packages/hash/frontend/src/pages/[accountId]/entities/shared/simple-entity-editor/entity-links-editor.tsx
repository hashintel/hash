import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolEntity,
  BlockProtocolLink,
  BlockProtocolLinkGroup,
} from "blockprotocol";
import { useMemo, VoidFunctionComponent } from "react";
import { tw } from "twind";

import {
  CreateLinkFnWithFixedSource,
  DeleteLinkFnWithFixedSource,
  EntityLinkDefinition,
} from "./types";
import { EntityFieldLinkEditor } from "./entity-field-link-editor";

type EntityLinkEditorProps = {
  accountId: string;
  aggregateEntities: BlockProtocolAggregateEntitiesFunction;
  createLinkFromEntity: CreateLinkFnWithFixedSource;
  deleteLinkFromEntity: DeleteLinkFnWithFixedSource;
  existingLinkGroups: BlockProtocolLinkGroup[];
  linkedEntities: BlockProtocolEntity[];
  linksInSchema: EntityLinkDefinition[];
};

const pathToString = (pathAsArray: string[]) => pathAsArray.join(".");

export const EntityLinksEditor: VoidFunctionComponent<
  EntityLinkEditorProps
> = ({
  accountId,
  aggregateEntities,
  createLinkFromEntity,
  deleteLinkFromEntity,
  existingLinkGroups,
  linkedEntities,
  linksInSchema,
}) => {
  const linksByPath = useMemo(
    () =>
      linksInSchema.map((link) => ({
        ...link,
        // @todo associate link index with these when updating for link pagination.
        linksOnField:
          existingLinkGroups
            .find(({ path }) => path === pathToString(link.path))
            ?.links.map((linkDef) => ({
              link: linkDef,
              linkedEntity: linkedEntities.find(
                ({ entityId, entityVersionId }) =>
                  !("operation" in linkDef) &&
                  linkDef.destinationEntityId === entityId &&
                  (linkDef.destinationEntityVersionId == null ||
                    linkDef.destinationEntityVersionId === entityVersionId),
              ),
            }))
            .filter(
              (
                linkData,
              ): linkData is {
                linkedEntity: BlockProtocolEntity;
                link: BlockProtocolLink;
              } => linkData.linkedEntity !== undefined,
            ) ?? [],
      })),
    [existingLinkGroups, linksInSchema, linkedEntities],
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
            <EntityFieldLinkEditor
              accountId={accountId}
              aggregateEntities={aggregateEntities}
              entityTypeId={link.permittedTypeIds[0]!} // @todo handle multiple permitted types
              allowsMultipleSelections={!!link.array}
              createLinkFromEntity={createLinkFromEntity}
              deleteLinkFromEntity={deleteLinkFromEntity}
              linksOnField={link.linksOnField}
              path={pathString}
            />
          </div>
        );
      })}
    </div>
  );
};
