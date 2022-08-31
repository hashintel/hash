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
import DataTypeModel from "./ontology/data-type.model";
import PropertyTypeModel from "./ontology/property-type.model";
import LinkTypeModel from "./ontology/link-type.model";
import EntityTypeModel from "./ontology/entity-type.model";
import EntityModel from "./knowledge/entity.model";
import UserModel from "./knowledge/user.model";
import LinkModel from "./knowledge/link.model";

export * from "./ontology/data-type.model";
export { DataTypeModel };

export * from "./ontology/property-type.model";
export { PropertyTypeModel };

export * from "./ontology/link-type.model";
export { LinkTypeModel };

export * from "./ontology/entity-type.model";
export { EntityTypeModel };

export * from "./knowledge/entity.model";
export { EntityModel };

export * from "./knowledge/user.model";
export { UserModel };

export * from "./knowledge/link.model";
export { LinkModel };

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
