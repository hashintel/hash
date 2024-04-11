import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  PropertyConfidence,
  UserEntityEditionProvenanceMetadata,
} from "@local/hash-graph-client";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  AccountGroupId,
  AccountId,
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRelationAndSubject,
  LinkData,
  OwnedById,
} from "@local/hash-subgraph";
import type { LinkEntity } from "@local/hash-subgraph/type-system-patch";

import type { ImpureGraphFunction } from "../../context-types";
import {
  getEntityTypeById,
  isEntityTypeLinkEntityType,
} from "../../ontology/primitive/entity-type";
import { getLatestEntityById } from "./entity";
import { afterCreateEntityHooks } from "./entity/after-create-entity-hooks";

export type CreateLinkEntityParams = {
  ownedById: OwnedById;
  properties?: EntityPropertiesObject;
  linkEntityTypeId: VersionedUrl;
  owner?: AccountId | AccountGroupId;
  draft?: boolean;
  leftEntityId: EntityId;
  leftEntityConfidence?: number;
  rightEntityId: EntityId;
  rightEntityConfidence?: number;
  relationships: EntityRelationAndSubject[];
  confidence?: number;
  propertyConfidence?: PropertyConfidence;
  provenance?: UserEntityEditionProvenanceMetadata;
};

export const isEntityLinkEntity = (entity: Entity): entity is LinkEntity =>
  !!entity.linkData;

/**
 * Create a link entity between a left and a right entity.
 *
 * @param params.ownedById - the id of the account who owns the new link entity
 * @param params.linkEntityTypeId - the link entity type ID of the link entity
 * @param params.leftEntityId - the ID of the left entity
 * @param params.rightEntityId - the ID of the right entity
 * @param params.actorId - the id of the account that is creating the link
 */
export const createLinkEntity: ImpureGraphFunction<
  CreateLinkEntityParams,
  Promise<LinkEntity>
> = async (context, authentication, params) => {
  const {
    ownedById,
    linkEntityTypeId,
    leftEntityId,
    rightEntityId,
    properties = {},
    draft = false,
    relationships,
    leftEntityConfidence,
    rightEntityConfidence,
    confidence,
    propertyConfidence,
    provenance,
  } = params;

  const linkEntityType = await getEntityTypeById(context, authentication, {
    entityTypeId: linkEntityTypeId,
  });

  /**
   * @todo: remove this check once it is made in the Graph API
   * @see https://linear.app/hash/issue/H-972/validate-links-when-creatingupdating-an-entity-or-links-tofrom-an
   */
  if (
    !(await isEntityTypeLinkEntityType(
      context,
      authentication,
      linkEntityType.schema,
    ))
  ) {
    throw new Error(
      `Entity type with ID "${linkEntityType.schema.$id}" is not a link entity type.`,
    );
  }

  const linkData: LinkData = {
    leftEntityId,
    rightEntityId,
    leftEntityConfidence,
    rightEntityConfidence,
  };

  const { data: metadata } = await context.graphApi.createEntity(
    authentication.actorId,
    {
      ownedById,
      linkData,
      entityTypeIds: [linkEntityType.schema.$id],
      properties,
      draft,
      relationships,
      confidence,
      propertyConfidence,
      provenance,
    },
  );

  const linkEntity = {
    metadata: mapGraphApiEntityMetadataToMetadata(metadata),
    properties,
    linkData,
  };

  for (const afterCreateHook of afterCreateEntityHooks) {
    if (afterCreateHook.entityTypeId === linkEntity.metadata.entityTypeId) {
      void afterCreateHook.callback({
        context,
        entity: linkEntity,
        authentication,
      });
    }
  }

  return linkEntity;
};

/**
 * Update a link entity.
 *
 * @param params.linkEntity - the link entity being updated
 * @param params.properties (optional) - the updated properties object of the link entity
 * @param params.actorId - the id of the account that is updating the entity
 */
export const updateLinkEntity: ImpureGraphFunction<
  {
    linkEntity: LinkEntity;
    properties?: EntityPropertiesObject;
    draft?: boolean;
    provenance?: UserEntityEditionProvenanceMetadata;
  },
  Promise<LinkEntity>
> = async ({ graphApi }, { actorId }, params) => {
  const { linkEntity } = params;

  const properties = params.properties ?? linkEntity.properties;

  const { data: metadata } = await graphApi.patchEntity(actorId, {
    entityId: linkEntity.metadata.recordId.entityId,
    properties: [
      {
        op: "replace",
        path: "",
        value: properties,
      },
    ],
    draft: params.draft,
    provenance: params.provenance,
  });

  return {
    metadata: mapGraphApiEntityMetadataToMetadata(metadata),
    properties,
    linkData: linkEntity.linkData,
  };
};

/**
 * Get the right entity of a link entity.
 *
 * @param params.linkEntity - the link entity
 */
export const getLinkEntityRightEntity: ImpureGraphFunction<
  { linkEntity: LinkEntity },
  Promise<Entity>
> = async (ctx, authentication, { linkEntity }) => {
  const rightEntity = await getLatestEntityById(ctx, authentication, {
    entityId: linkEntity.linkData.rightEntityId,
  });

  return rightEntity;
};

/**
 * Get the left entity of a link entity.
 *
 * @param params.linkEntity - the link entity
 */
export const getLinkEntityLeftEntity: ImpureGraphFunction<
  { linkEntity: LinkEntity },
  Promise<Entity>
> = async (ctx, authentication, { linkEntity }) => {
  const leftEntity = await getLatestEntityById(ctx, authentication, {
    entityId: linkEntity.linkData.leftEntityId,
  });

  return leftEntity;
};
