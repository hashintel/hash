import { Entity } from "@hashintel/hash-subgraph";
import {
  BlockModel,
  CommentModel,
  EntityModel,
  PageModel,
} from "../../../../auth/model";
import {
  Block,
  Page,
  Comment,
} from "../../../../auth/model/aggregation.model/apiTypes.gen";

export const mapEntityModelToGQL = (entityModel: EntityModel): Entity =>
  entityModel.entity;

export type ExternalPageResolversGQL = "contents";
export type UnresolvedPageGQL = Omit<Page, ExternalPageResolversGQL>;

export const mapPageModelToGQL = (pageModel: PageModel): UnresolvedPageGQL => ({
  ...mapEntityModelToGQL(pageModel),
  title: pageModel.getTitle(),
  archived: pageModel.getArchived(),
  summary: pageModel.getSummary(),
  index: pageModel.getIndex(),
  icon: pageModel.getIcon(),
});

export type ExternalCommentResolversGQL =
  | "hasText"
  | "textUpdatedAt"
  | "parent"
  | "author"
  | "replies";
export type UnresolvedCommentGQL = Omit<Comment, ExternalCommentResolversGQL>;

export const mapCommentModelToGQL = (
  commentModel: CommentModel,
): UnresolvedCommentGQL => ({
  ...mapEntityModelToGQL(commentModel),
  resolvedAt: commentModel.getResolvedAt(),
  deletedAt: commentModel.getDeletedAt(),
});

export type ExternalBlockResolversGQL = "blockChildEntity";
export type UnresolvedBlockGQL = Omit<Block, ExternalBlockResolversGQL>;
export const mapBlockModelToGQL = (
  blockModel: BlockModel,
): UnresolvedBlockGQL => ({
  ...mapEntityModelToGQL(blockModel),
  componentId: blockModel.getComponentId(),
});
