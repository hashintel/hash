import { EntityModel, PageModel } from "../../../model";
import { KnowledgeEntity, KnowledgePage } from "../../apiTypes.gen";
import { entityTypeModelToGQL } from "../ontology/model-mapping";

export const entityModelToGQL = (
  entityModel: EntityModel,
): KnowledgeEntity => ({
  entityId: entityModel.entityId,
  entityType: entityTypeModelToGQL(entityModel.entityTypeModel),
  entityTypeId: entityModel.entityTypeModel.schema.$id,
  entityVersionId: entityModel.version,
  ownedById: entityModel.accountId,
  properties: entityModel.properties,
});

export type ExternalPageResolversGQL = "contents";
export type UnresolvedPageGQL = Omit<KnowledgePage, ExternalPageResolversGQL>;

export const pageModelToGQL = (pageModel: PageModel): UnresolvedPageGQL => ({
  ...entityModelToGQL(pageModel),
  title: pageModel.getTitle(),
  properties: pageModel.properties,
  archived: pageModel.getArchived(),
  summary: pageModel.getSummary(),
});
