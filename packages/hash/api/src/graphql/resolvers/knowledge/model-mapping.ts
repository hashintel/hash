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
>;

export const mapEntityModelToGQL = (
  entityModel: EntityModel,
): UnresolvedKnowledgeEntityGQL => ({
  entityId: entityModel.entityId,
  entityType: mapEntityTypeModelToGQL(entityModel.entityTypeModel),
  entityTypeId: entityModel.entityTypeModel.schema.$id,
  entityVersionId: entityModel.version,
  ownedById: entityModel.accountId,
  accountId: entityModel.accountId,
  properties: entityModel.properties,
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
