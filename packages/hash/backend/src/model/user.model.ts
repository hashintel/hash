import { DBClient } from "../db";
import { EntityType } from "../db/adapter";
import {
  sendEmailVerificationCodeToEmailAddress,
  sendLoginCodeToEmailAddress,
} from "../email";
import { genId } from "../util";
import {
  UserProperties,
  User as GQLUser,
  EntityType as GQLEntityType,
  Email,
} from "../graphql/apiTypes.gen";
import Entity, { EntityConstructorArgs } from "./entity.model";
import VerificationCode from "./verificationCode.model";

type UserConstructorArgs = {
  properties: UserProperties;
} & Omit<EntityConstructorArgs, "type">;

class User extends Entity {
  properties: UserProperties;

  constructor({ properties, ...remainingArgs }: UserConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static getEntityType = async (db: DBClient): Promise<EntityType> =>
    db
      .getSystemTypeLatestVersion({ systemTypeName: "User" })
      .then((userEntityType) => {
        if (!userEntityType)
          throw new Error("User system entity type not found in datastore");

        return userEntityType;
      });

  static getUserById =
    (db: DBClient) =>
    ({ id }: { id: string }): Promise<User | null> =>
      db
        .getUserById({ id })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static getUserByEmail =
    (db: DBClient) =>
    ({
      email,
      verified = true,
      primary,
    }: {
      email: string;
      verified?: boolean;
      primary?: boolean;
    }): Promise<User | null> =>
      db
        .getUserByEmail({ email, verified, primary })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static getUserByShortname =
    (db: DBClient) =>
    ({ shortname }: { shortname: string }): Promise<User | null> =>
      db
        .getUserByShortname({ shortname })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static create =
    (db: DBClient) =>
    async (properties: UserProperties): Promise<User> => {
      const id = genId();

      const entity = await db.createEntity({
        accountId: id,
        entityVersionId: id,
        createdById: id, // Users "create" themselves
        entityTypeId: (await User.getEntityType(db)).entityId,
        properties,
        versioned: false, // @todo: should user's be versioned?
      });

      return new User(entity);
    };

  private updateProperties = (db: DBClient) => (properties: UserProperties) =>
    db
      .updateEntity({
        accountId: this.accountId,
        entityVersionId: this.entityVersionId,
        entityId: this.entityId,
        properties,
      })
      .then(() => {
        this.properties = properties;
        return this;
      });

  static shortnameIsValid = (shortname: string) =>
    // cannot be empty string
    shortname !== "" &&
    // cannot include whitespace
    !shortname.match(/\s/);

  static shortnameIsUnique = (db: DBClient) => (shortname: string) =>
    User.getUserByShortname(db)({ shortname }).then(
      (existingUser) => existingUser === null
    );

  updateShortname = (db: DBClient) => async (updatedShortname: string) =>
    this.updateProperties(db)({
      ...this.properties,
      shortname: updatedShortname,
    });

  static preferredNameIsValid = (preferredName: string) => preferredName !== "";

  updatePreferredName = (db: DBClient) => (updatedPreferredName: string) =>
    this.updateProperties(db)({
      ...this.properties,
      preferredName: updatedPreferredName,
    });

  isAccountSignupComplete = () =>
    this.properties.shortname !== undefined &&
    this.properties.preferredName !== undefined;

  getPrimaryEmail = (): Email => {
    const primaryEmail = this.properties.emails.find(
      ({ primary }) => primary === true
    );

    if (!primaryEmail)
      throw new Error(
        `Critical: User with entityId ${this.entityId} does not have a primary email address`
      );

    return primaryEmail;
  };

  getEmail = (emailAddress: string): Email | null =>
    this.properties.emails.find(({ address }) => address === emailAddress) ||
    null;

  verifyEmailAddress = (db: DBClient) => (emailAddress: string) =>
    this.updateProperties(db)({
      ...this.properties,
      emails: this.properties.emails.map((email) =>
        email.address === emailAddress ? { ...email, verified: true } : email
      ),
    });

  sendLoginVerificationCode =
    (db: DBClient) => async (alternateEmailAddress?: string) => {
      // Check the supplied email address can be used for sending login codes
      if (alternateEmailAddress) {
        const email = this.getEmail(alternateEmailAddress);
        if (!email)
          throw new Error(
            `User with entityId '${this.entityId}' does not have an email address '${alternateEmailAddress}'`
          );
        if (!email.verified)
          throw new Error(
            `User with entityId '${this.entityId}' hasn't verified the email address '${alternateEmailAddress}'`
          );
      }

      const emailAddress =
        alternateEmailAddress || this.getPrimaryEmail().address;

      const verificationCode = await VerificationCode.create(db)({
        accountId: this.accountId,
        userId: this.entityId,
        emailAddress,
      });

      return sendLoginCodeToEmailAddress(verificationCode, emailAddress).then(
        () => verificationCode
      );
    };

  sendEmailVerificationCode =
    (db: DBClient) => async (emailAddress: string) => {
      const email = this.getEmail(emailAddress);

      if (!email)
        throw new Error(
          `User with entityId '${this.entityId}' does not have an email address '${emailAddress}'`
        );

      if (email.verified)
        throw new Error(
          `User with id '${this.entityId}' has already verified the email address '${emailAddress}'`
        );

      const verificationCode = await VerificationCode.create(db)({
        accountId: this.accountId,
        userId: this.entityId,
        emailAddress,
      });

      return sendEmailVerificationCodeToEmailAddress(
        verificationCode,
        emailAddress
      ).then(() => verificationCode);
    };

  toGQLUser = (): GQLUser => ({
    ...this.toGQLEntity(),
    entityType: this.entityType as GQLEntityType,
    accountSignupComplete: this.isAccountSignupComplete(),
    properties: this.properties,
  });
}

export default User;
