import { GraphApi } from "@hashintel/hash-graph-client";

import { BlockModel, EntityModel, PageModel } from "../../../model";
import {
  KnowledgeBlock,
  KnowledgeEntity,
  KnowledgePage,
} from "../../apiTypes.gen";
import { entityTypeModelToGQL } from "../ontology/model-mapping";

export const entityModelToGQL = (
  entityModel: EntityModel,
): KnowledgeEntity => ({
  entityId: entityModel.entityId,
  entityType: entityTypeModelToGQL(entityModel.entityTypeModel),
  entityTypeId: entityModel.entityTypeModel.schema.$id,
  entityVersionId: entityModel.version,
  linkedEntities: [],
  ownedById: entityModel.accountId,
  properties: entityModel.properties,
});

export const blockModelToGQL = async (
  graphApi: GraphApi,
  blockModel: BlockModel,
): Promise<KnowledgeBlock> => ({
  ...entityModelToGQL(blockModel),
  dataEntity: entityModelToGQL(await blockModel.getBlockData(graphApi)),
});

export const pageModelToGQL = async (
  graphApi: GraphApi,
  pageModel: PageModel,
): Promise<KnowledgePage> => ({
  ...entityModelToGQL(pageModel),
  title: pageModel.getTitle(),
  properties: pageModel.properties,
  archived: pageModel.getArchived(),
  summary: pageModel.getSummary(),
  contents: await Promise.all(
    (
      await pageModel.getBlocks(graphApi)
    ).map(async (block) => blockModelToGQL(graphApi, block)),
  ),
});
