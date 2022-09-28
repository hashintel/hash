import { EntityModel, PageModel } from "../../../model";
import { KnowledgeEntity, KnowledgePage } from "../../apiTypes.gen";
import { entityTypeModelToGQL } from "../ontology/model-mapping";

export type ExternalEntityResolversGQL = "linkedEntities";
export type UnresolvedEntityGQL = Omit<
  KnowledgeEntity,
  ExternalEntityResolversGQL
>;

export const mapEntityModelToGQL = (
  entityModel: EntityModel,
): UnresolvedEntityGQL => ({
  entityId: entityModel.entityId,
  entityType: entityTypeModelToGQL(entityModel.entityTypeModel),
  entityTypeId: entityModel.entityTypeModel.schema.$id,
  entityVersionId: entityModel.version,
  ownedById: entityModel.accountId,
  properties: entityModel.properties,
});

export type ExternalPageResolversGQL = ExternalEntityResolversGQL | "contents";
export type UnresolvedPageGQL = Omit<KnowledgePage, ExternalPageResolversGQL>;

export const mapPageModelToGQL = (pageModel: PageModel): UnresolvedPageGQL => ({
  ...mapEntityModelToGQL(pageModel),
  title: pageModel.getTitle(),
  properties: pageModel.properties,
  archived: pageModel.getArchived(),
  summary: pageModel.getSummary(),
});
