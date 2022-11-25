import { EntityWithMetadata } from "@hashintel/hash-subgraph";
import {
  BlockModel,
  CommentModel,
  EntityModel,
  PageModel,
} from "../../../model";
import {
  PersistedBlock,
  PersistedPage,
  PersistedComment,
} from "../../apiTypes.gen";

export const mapEntityModelToGQL = (
  entityModel: EntityModel,
): EntityWithMetadata => entityModel.entity;

export type ExternalPersistedPageResolversGQL = "contents";
export type UnresolvedPersistedPageGQL = Omit<
  PersistedPage,
  ExternalPersistedPageResolversGQL
>;

export const mapPageModelToGQL = (
  pageModel: PageModel,
): UnresolvedPersistedPageGQL => ({
  ...mapEntityModelToGQL(pageModel),
  title: pageModel.getTitle(),
  archived: pageModel.getArchived(),
  summary: pageModel.getSummary(),
  index: pageModel.getIndex(),
  icon: pageModel.getIcon(),
});

export type ExternalPersistedCommentResolversGQL =
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
  resolvedAt: commentModel.getResolvedAt(),
  deletedAt: commentModel.getDeletedAt(),
});

export type ExternalPersistedBlockResolversGQL = "blockChildEntity";
export type UnresolvedPersistedBlockGQL = Omit<
  PersistedBlock,
  ExternalPersistedBlockResolversGQL
>;
export const mapBlockModelToGQL = (
  blockModel: BlockModel,
): UnresolvedPersistedBlockGQL => ({
  ...mapEntityModelToGQL(blockModel),
  componentId: blockModel.getComponentId(),
});
