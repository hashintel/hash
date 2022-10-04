import { BlockModel, EntityModel, LinkModel, PageModel } from "../../../model";
import {
  KnowledgeBlock,
  KnowledgeEntity,
  KnowledgeLink,
  KnowledgePage,
} from "../../apiTypes.gen";
import { mapEntityTypeModelToGQL } from "../ontology/model-mapping";

export type ExternalKnowledgeEntityResolversGQL = "linkedEntities";
export type UnresolvedKnowledgeEntityGQL = Omit<
  KnowledgeEntity,
  ExternalKnowledgeEntityResolversGQL
> & { workspaceTypeName?: string };

export const mapEntityModelToGQL = (
  entityModel: EntityModel,
): UnresolvedKnowledgeEntityGQL => ({
  entityId: entityModel.entityId,
  entityType: mapEntityTypeModelToGQL(entityModel.entityTypeModel),
  entityTypeId: entityModel.entityTypeModel.schema.$id,
  entityVersion: entityModel.version,
  ownedById: entityModel.ownedById,
  accountId: entityModel.ownedById,
  properties: entityModel.properties,
  /**
   * To be used by the `KnowledgeEntity` `__resolveType` resolver method to reliably determine
   * the GQL type of this entity. Note that this is not exposed in the GQL type definitions,
   * and is therefore not returned to GraphQL clients.
   */
  workspaceTypeName: entityModel.entityTypeModel.workspaceTypeName,
});

export type ExternalKnowledgePageResolversGQL =
  | ExternalKnowledgeEntityResolversGQL
  | "contents";
export type UnresolvedKnowledgePageGQL = Omit<
  KnowledgePage,
  ExternalKnowledgePageResolversGQL
>;

export const mapPageModelToGQL = (
  pageModel: PageModel,
): UnresolvedKnowledgePageGQL => ({
  ...mapEntityModelToGQL(pageModel),
  title: pageModel.getTitle(),
  properties: pageModel.properties,
  archived: pageModel.getArchived(),
  summary: pageModel.getSummary(),
});

export type ExternalKnowledgeBlockResolversGQL =
  | ExternalKnowledgeEntityResolversGQL
  | "dataEntity";
export type UnresolvedKnowledgeBlockGQL = Omit<
  KnowledgeBlock,
  ExternalKnowledgeBlockResolversGQL
>;
export const mapBlockModelToGQL = (
  blockModel: BlockModel,
): UnresolvedKnowledgeBlockGQL => ({
  ...mapEntityModelToGQL(blockModel),
  componentId: blockModel.getComponentId(),
});

export type UnresolvedKnowledgeLinkGQL = Omit<
  KnowledgeLink,
  "sourceEntity" | "targetEntity"
> & {
  sourceEntity: UnresolvedKnowledgeEntityGQL;
  targetEntity: UnresolvedKnowledgeEntityGQL;
};

export const mapLinkModelToGQL = (
  linkModel: LinkModel,
): UnresolvedKnowledgeLinkGQL => ({
  ownedById: linkModel.ownedById,
  linkTypeId: linkModel.linkTypeModel.schema.$id,
  index: linkModel.index,
  sourceEntityId: linkModel.sourceEntityModel.entityId,
  targetEntityId: linkModel.targetEntityModel.entityId,
  // These may be field resolvers at some point.
  // Currently we require source and target on link model instantiation.
  sourceEntity: mapEntityModelToGQL(linkModel.sourceEntityModel),
  targetEntity: mapEntityModelToGQL(linkModel.targetEntityModel),
});
