import { BlockModel, EntityModel, PageModel } from "../../../model";
import {
  KnowledgeBlock,
  KnowledgeEntity,
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
  index: pageModel.getIndex(),
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
