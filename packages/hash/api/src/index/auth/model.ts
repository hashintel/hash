// The following import order prevents dependency cycles from occurring.
// The name of these default imports define the name of the model classes
// when accessed from outside of this module.

// import File from "./file.model";
import Aggregation from "./model/aggregation.model";

export * from "./model/entity.model";
export { default as EntityModel } from "./model/entity.model";

export * from "./model/hashInstance.model";
export { default as HashInstanceModel } from "./model/hashInstance.model";

export * from "./model/linkEntity.model";
export { default as LinkEntityModel } from "./model/linkEntity.model";

export * as AccountFields from "./model/account.fields";

export * from "./model/user.model";
export { default as UserModel } from "./model/user.model";

export * from "./model/org.model";
export { default as OrgModel } from "./model/org.model";

export * from "./model/orgMembership.model";
export { default as OrgMembershipModel } from "./model/orgMembership.model";

export * from "./model/block.model";
export { default as BlockModel } from "./model/block.model";

export * from "./model/page.model";
export { default as PageModel } from "./model/page.model";

export * from "./model/comment.model";
export { default as CommentModel } from "./model/comment.model";

/** @todo: deprecate legacy model classes */

export * from "./model/aggregation.model";
export { Aggregation };

// export * from "./file.model";
// export { File };
