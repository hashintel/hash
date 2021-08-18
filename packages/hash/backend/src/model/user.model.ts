import { DBAdapter } from "src/db";
import { sendLoginCodeToEmailAddress } from "../email";
import { genId } from "src/util";
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

  sendLoginVerificationCode =
    (db: DBAdapter) => async (alternateEmailAddress?: string) => {
      // Check the supplied email address can be used for sending login codes
      if (alternateEmailAddress) {
        const email = this.properties.emails.find(
          ({ address }) => address === alternateEmailAddress
        );
        if (!email)
          throw new Error(
            `User with id '${this.id}' does not have an email address '${alternateEmailAddress}'`
          );
        if (!email.verified)
          throw new Error(
            `User with id '${this.id}' hasn't verified the email address '${alternateEmailAddress}'`
          );
      }

      const verificationCode = await VerificationCode.create(db)({
        accountId: this.accountId,
        userId: this.id,
      });

      return sendLoginCodeToEmailAddress(
        verificationCode,
        alternateEmailAddress || this.getPrimaryEmail().address
      ).then(() => verificationCode);
    };

  toGQLUser = (): GQLUser => ({
    ...this.toGQLEntity(),
    properties: this.properties,
  });
}

export default User;
