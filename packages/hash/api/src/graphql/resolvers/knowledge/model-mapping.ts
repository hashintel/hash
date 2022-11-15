import {
  BlockModel,
  CommentModel,
  EntityModel,
  LinkModel,
  PageModel,
} from "../../../model";
import {
  PersistedBlock,
  PersistedEntity,
  PersistedLink,
  PersistedPage,
  PersistedComment,
} from "../../apiTypes.gen";
import { mapEntityTypeModelToGQL } from "../ontology/model-mapping";

export type ExternalPersistedEntityResolversGQL = "linkedEntities";
export type UnresolvedPersistedEntityGQL = Omit<
  PersistedEntity,
  ExternalPersistedEntityResolversGQL
> & { systemTypeName?: string };

export const mapEntityModelToGQL = (
  entityModel: EntityModel,
): UnresolvedPersistedEntityGQL => ({
  entityId: entityModel.entityId,
  entityTypeId: entityModel.entityTypeModel.schema.$id,
  entityVersion: entityModel.version,
  ownedById: entityModel.ownedById,
  accountId: entityModel.ownedById,
  properties: entityModel.properties,
  /**
   * To be used by the `PersistedEntity` `__resolveType` resolver method to reliably determine
   * the GQL type of this entity. Note that this is not exposed in the GQL type definitions,
   * and is therefore not returned to GraphQL clients.
   */
  systemTypeName: entityModel.entityTypeModel.systemTypeName,
});

export type ExternalPersistedPageResolversGQL =
  | ExternalPersistedEntityResolversGQL
  | "contents";
export type UnresolvedPersistedPageGQL = Omit<
  PersistedPage,
  ExternalPersistedPageResolversGQL
>;

export const mapPageModelToGQL = (
  pageModel: PageModel,
): UnresolvedPersistedPageGQL => ({
  ...mapEntityModelToGQL(pageModel),
  entityType: mapEntityTypeModelToGQL(pageModel.entityTypeModel),
  title: pageModel.getTitle(),
  properties: pageModel.properties,
  archived: pageModel.getArchived(),
  summary: pageModel.getSummary(),
  index: pageModel.getIndex(),
  icon: pageModel.getIcon(),
});

export type ExternalPersistedCommentResolversGQL =
  | ExternalPersistedEntityResolversGQL
  | "hasText"
  | "textUpdatedAt"
  | "parent"
  | "author"
  | "replies";

export type UnresolvedPersistedCommentGQL = Omit<
  PersistedComment,
  ExternalPersistedCommentResolversGQL
>;

export const mapCommentModelToGQL = (
  commentModel: CommentModel,
): UnresolvedPersistedCommentGQL => ({
  ...mapEntityModelToGQL(commentModel),
  entityType: mapEntityTypeModelToGQL(commentModel.entityTypeModel),
  resolvedAt: commentModel.getResolvedAt(),
  deletedAt: commentModel.getDeletedAt(),
});

export type ExternalPersistedBlockResolversGQL =
  | ExternalPersistedEntityResolversGQL
  | "blockChildEntity";
export type UnresolvedPersistedBlockGQL = Omit<
  PersistedBlock,
  ExternalPersistedBlockResolversGQL
>;
export const mapBlockModelToGQL = (
  blockModel: BlockModel,
): UnresolvedPersistedBlockGQL => ({
  ...mapEntityModelToGQL(blockModel),
  entityType: mapEntityTypeModelToGQL(blockModel.entityTypeModel),
  componentId: blockModel.getComponentId(),
});

export type UnresolvedPersistedLinkGQL = Omit<
  PersistedLink,
  "sourceEntity" | "targetEntity"
> & {
  sourceEntity: UnresolvedPersistedEntityGQL;
  targetEntity: UnresolvedPersistedEntityGQL;
};

export const mapLinkModelToGQL = (
  linkModel: LinkModel,
): UnresolvedPersistedLinkGQL => ({
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
