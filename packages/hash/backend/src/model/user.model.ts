import { DBAdapter } from "../db";
import {
  sendEmailVerificationCodeToEmailAddress,
  sendLoginCodeToEmailAddress,
} from "../email";
import { genId } from "../util";
import {
  UserProperties,
  User as GQLUser,
  Email,
} from "../graphql/apiTypes.gen";
import Entity, { EntityConstructorArgs } from "./entity.model";
import VerificationCode from "./verificationCode.model";

type UserConstructorArgs = {
  properties: UserProperties;
} & Omit<EntityConstructorArgs, "type">;

class User extends Entity {
  properties: UserProperties;
  type: "User";

  constructor({ properties, ...remainingArgs }: UserConstructorArgs) {
    super({
      ...remainingArgs,
      properties,
      type: "User",
    });
    this.properties = properties;
    this.type = "User";
  }

  static getUserById =
    (db: DBAdapter) =>
    ({ id }: { id: string }): Promise<User | null> =>
      db
        .getUserById({ id })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static getUserByEmail =
    (db: DBAdapter) =>
    ({ email }: { email: string }): Promise<User | null> =>
      db
        .getUserByEmail({ email })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static getUserByShortname =
    (db: DBAdapter) =>
    ({ shortname }: { shortname: string }): Promise<User | null> =>
      db
        .getUserByShortname({ shortname })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static create =
    (db: DBAdapter) =>
    async (properties: UserProperties): Promise<User> => {
      const id = genId();

      const entity = await db.createEntity({
        accountId: id,
        entityId: id,
        createdById: id, // Users "create" themselves
        type: "User",
        properties,
        versioned: false, // @todo: should user's be versioned?
      });

      return new User({ id, ...entity });
    };

  getPrimaryEmail = (): Email => {
    const primaryEmail = this.properties.emails.find(
      ({ primary }) => primary === true
    );

    if (!primaryEmail)
      throw new Error(
        `Critical: User with id ${this.id} does not have a primary email address`
      );

    return primaryEmail;
  };

  getEmail = (emailAddress: string): Email | null =>
    this.properties.emails.find(({ address }) => address === emailAddress) ||
    null;

  sendLoginVerificationCode =
    (db: DBAdapter) => async (alternateEmailAddress?: string) => {
      // Check the supplied email address can be used for sending login codes
      if (alternateEmailAddress) {
        const email = this.getEmail(alternateEmailAddress);
        if (!email)
          throw new Error(
            `User with id '${this.id}' does not have an email address '${alternateEmailAddress}'`
          );
        if (!email.verified)
          throw new Error(
            `User with id '${this.id}' hasn't verified the email address '${alternateEmailAddress}'`
          );
      }

      const emailAddress =
        alternateEmailAddress || this.getPrimaryEmail().address;

      const verificationCode = await VerificationCode.create(db)({
        accountId: this.accountId,
        userId: this.id,
        emailAddress,
      });

      return sendLoginCodeToEmailAddress(verificationCode, emailAddress).then(
        () => verificationCode
      );
    };

  sendEmailVerificationCode =
    (db: DBAdapter) => async (emailAddress: string) => {
      const email = this.getEmail(emailAddress);

      if (!email)
        throw new Error(
          `User with id '${this.id}' does not have an email address '${emailAddress}'`
        );

      if (email.verified)
        throw new Error(
          `User with id '${this.id}' has already verified the email address '${emailAddress}'`
        );

      const verificationCode = await VerificationCode.create(db)({
        accountId: this.accountId,
        userId: this.id,
        emailAddress,
      });

      return sendEmailVerificationCodeToEmailAddress(
        verificationCode,
        emailAddress
      ).then(() => verificationCode);
    };

  toGQLUser = (): GQLUser => ({
    ...this.toGQLEntity(),
    properties: this.properties,
  });
}

export default User;
