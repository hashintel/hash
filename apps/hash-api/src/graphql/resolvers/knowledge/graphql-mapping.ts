import { Block } from "../../../graph/knowledge/system-types/block";
import { Comment } from "../../../graph/knowledge/system-types/comment";
import { Page } from "../../../graph/knowledge/system-types/page";
import {
  Block as GQLBlock,
  Comment as GQLComment,
  Page as GQLPage,
} from "../../api-types.gen";
import { Entity } from "../hash-subgraph/src";

export const mapEntityToGQL = (entity: Entity): Entity => entity;

export type ExternalPageResolversGQL = "contents";
export type UnresolvedPageGQL = Omit<GQLPage, ExternalPageResolversGQL>;

export const mapPageToGQL = (page: Page): UnresolvedPageGQL => ({
  ...mapEntityToGQL(page.entity),
  title: page.title,
  archived: page.archived,
  summary: page.summary,
  index: page.index,
  icon: page.icon,
});

export type ExternalCommentResolversGQL =
  | "hasText"
  | "textUpdatedAt"
  | "parent"
  | "author"
  | "replies";
export type UnresolvedCommentGQL = Omit<
  GQLComment,
  ExternalCommentResolversGQL
>;

export const mapCommentToGQL = (comment: Comment): UnresolvedCommentGQL => ({
  ...mapEntityToGQL(comment.entity),
  resolvedAt: comment.resolvedAt,
  deletedAt: comment.deletedAt,
});

export type ExternalBlockResolversGQL = "blockChildEntity";
export type UnresolvedBlockGQL = Omit<GQLBlock, ExternalBlockResolversGQL>;

export const mapBlockToGQL = (block: Block): UnresolvedBlockGQL => ({
  ...mapEntityToGQL(block.entity),
  componentId: block.componentId,
});
