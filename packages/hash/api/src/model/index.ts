// The following import order prevents dependency cycles from occurring.
// The name of these default imports define the name of the model classes
// when accessed from outside of this module.

import File from "./file.model";
import Aggregation from "./aggregation.model";

export * from "./ontology/data-type.model";
export { default as DataTypeModel } from "./ontology/data-type.model";

export * from "./ontology/property-type.model";
export { default as PropertyTypeModel } from "./ontology/property-type.model";

export * from "./ontology/entity-type.model";
export { default as EntityTypeModel } from "./ontology/entity-type.model";

export * from "./knowledge/entity.model";
export { default as EntityModel } from "./knowledge/entity.model";

export * from "./knowledge/hashInstance.model";
export { default as HashInstanceModel } from "./knowledge/hashInstance.model";

export * from "./knowledge/linkEntity.model";
export { default as LinkEntityModel } from "./knowledge/linkEntity.model";

export * as AccountFields from "./knowledge/account.fields";

export * from "./knowledge/user.model";
export { default as UserModel } from "./knowledge/user.model";

export * from "./knowledge/org.model";
export { default as OrgModel } from "./knowledge/org.model";

export * from "./knowledge/orgMembership.model";
export { default as OrgMembershipModel } from "./knowledge/orgMembership.model";

export * from "./knowledge/block.model";
export { default as BlockModel } from "./knowledge/block.model";

export * from "./knowledge/page.model";
export { default as PageModel } from "./knowledge/page.model";

export * from "./knowledge/comment.model";
export { default as CommentModel } from "./knowledge/comment.model";

/** @todo: deprecate legacy model classes */

export * from "./aggregation.model";
export { Aggregation };

export * from "./file.model";
export { File };
