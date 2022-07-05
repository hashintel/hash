import {
  EmbedderGraphMessageCallbacks,
  Entity,
  Link,
  LinkGroup,
} from "@blockprotocol/graph";
import { useMemo, VoidFunctionComponent } from "react";
import { tw } from "twind";

import { CreateLinkFnWithFixedSource, EntityLinkDefinition } from "./types";
import { EntityFieldLinkEditor } from "./entity-field-link-editor";

type EntityLinkEditorProps = {
  aggregateEntities: EmbedderGraphMessageCallbacks["aggregateEntities"];
  createLinkFromEntity: CreateLinkFnWithFixedSource;
  deleteLinkFromEntity: EmbedderGraphMessageCallbacks["deleteLink"];
  existingLinkGroups: LinkGroup[];
  linkedEntities: Entity[];
  linksInSchema: EntityLinkDefinition[];
};

const pathToString = (pathAsArray: string[]) => pathAsArray.join(".");

export const EntityLinksEditor: VoidFunctionComponent<
  EntityLinkEditorProps
> = ({
  aggregateEntities,
  createLinkFromEntity,
  deleteLinkFromEntity,
  existingLinkGroups,
  linkedEntities,
  linksInSchema,
}) => {
  console.log({ linkedEntities, existingLinkGroups });
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
                ({ entityId }) =>
                  !("operation" in linkDef) &&
                  linkDef.destinationEntityId === entityId,
              ),
            }))
            .filter(
              (
                linkData,
              ): linkData is {
                linkedEntity: Entity;
                link: Link;
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
