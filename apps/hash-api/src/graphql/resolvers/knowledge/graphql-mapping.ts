import type { Entity } from "@local/hash-subgraph";

import type { Block } from "../../../graph/knowledge/system-types/block";
import type { Comment } from "../../../graph/knowledge/system-types/comment";
import type { Page } from "../../../graph/knowledge/system-types/page";
import type {
  Block as GQLBlock,
  Comment as GQLComment,
  Page as GQLPage,
} from "../../api-types.gen";

export const mapEntityToGQL = (entity: Entity): Entity => entity;

export type ExternalPageResolversGQL =
  | "contents"
  | "canUserEdit"
  | "userPermissions";
export type UnresolvedPageGQL = Omit<GQLPage, ExternalPageResolversGQL>;

export const mapPageToGQL = (page: Page): UnresolvedPageGQL => ({
  ...mapEntityToGQL(page.entity),
  title: page.title,
  archived: page.archived,
  summary: page.summary,
  fractionalIndex: page.fractionalIndex,
  icon: page.icon,
});

export type ExternalCommentResolversGQL =
  | "canUserEdit"
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
