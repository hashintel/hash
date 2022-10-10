// The following import order prevents dependency cycles from occurring.
// The name of these default imports define the name of the model classes
// when accessed from outside of this module.

import EntityType from "./entityType.model";
import VerificationCode from "./verificationCode.model";
import Entity from "./entity.model";
import Account from "./account.model";
import User from "./user.model";
import Org from "./org.model";
import AccessToken from "./accessToken.model";
import OrgInvitationLink from "./orgInvitationLink.model";
import OrgEmailInvitation from "./orgEmailInvitation.model";
import File from "./file.model";
import OrgMembership from "./orgMembership.model";
import Page from "./page.model";
import Block from "./block.model";
import Link from "./link.model";
import Aggregation from "./aggregation.model";
import Comment from "./comment.model";

export * from "./ontology/data-type.model";
export { default as DataTypeModel } from "./ontology/data-type.model";

export * from "./ontology/property-type.model";
export { default as PropertyTypeModel } from "./ontology/property-type.model";

export * from "./ontology/link-type.model";
export { default as LinkTypeModel } from "./ontology/link-type.model";

export * from "./ontology/entity-type.model";
export { default as EntityTypeModel } from "./ontology/entity-type.model";

export * from "./knowledge/entity.model";
export { default as EntityModel } from "./knowledge/entity.model";

export * from "./knowledge/link.model";
export { default as LinkModel } from "./knowledge/link.model";

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

export * from "./entityType.model";
export { EntityType };

export * from "./verificationCode.model";
export { VerificationCode };

export * from "./link.model";
export { Link };

export * from "./aggregation.model";
export { Aggregation };

export * from "./entity.model";
export { Entity };

export * from "./account.model";
export { Account };

export * from "./user.model";
export { User };

export * from "./org.model";
export { Org };

export * from "./accessToken.model";
export { AccessToken };

export * from "./orgInvitationLink.model";
export { OrgInvitationLink };

export * from "./orgEmailInvitation.model";
export { OrgEmailInvitation };

export * from "./file.model";
export { File };

export * from "./orgMembership.model";
export { OrgMembership };

export * from "./page.model";
export { Page };

export * from "./block.model";
export { Block };

export * from "./comment.model";
export { Comment };
