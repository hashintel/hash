import { ApolloError, UserInputError } from "apollo-server-express";

import { Account, Entity, EntityConstructorArgs, Org, User } from ".";
import { DBClient } from "../db";
import { RESTRICTED_SHORTNAMES } from "./util";
import { DBOrgProperties, DBUserProperties } from "../db/adapter";

export const ALLOWED_SHORTNAME_CHARS = /^[a-zA-Z0-9-_]+$/;

type DBAccountProperties = DBUserProperties | DBOrgProperties;

export type AccountConstructorArgs = {
  properties: DBAccountProperties;
} & EntityConstructorArgs;

abstract class __Account extends Entity {
  properties: DBAccountProperties;

  constructor(args: AccountConstructorArgs) {
    super(args);
    this.properties = args.properties;
  }

  static getAll = async (client: DBClient): Promise<(User | Org)[]> => {
    const accountDbEntities = await client.getAllAccounts();

    return accountDbEntities.map((dbEntity) =>
      dbEntity.entityTypeName === "User"
        ? new User(dbEntity)
        : new Org(dbEntity)
    );
  };

  private static checkShortnameChars = (shortname: string) => {
    if (shortname.search(ALLOWED_SHORTNAME_CHARS)) {
      throw new UserInputError(
        "Shortname may only contain letters, numbers, - or _"
      );
    }
    if (shortname[0] === "-") {
      throw new UserInputError("Shortname cannot start with '-'");
    }
  };

  static isShortnameReserved = (shortname: string): boolean =>
    RESTRICTED_SHORTNAMES.includes(shortname);

  static isShortnameTaken =
    (client: DBClient) =>
    async (shortname: string): Promise<boolean> => {
      const [org, user] = await Promise.all([
        await Org.getOrgByShortname(client)({ shortname }),
        await User.getUserByShortname(client)({ shortname }),
      ]);

      return org !== null || user !== null;
    };

  static validateShortname =
    (client: DBClient) => async (shortname: string) => {
      Account.checkShortnameChars(shortname);

      if (
        Account.isShortnameReserved(shortname) ||
        (await Account.isShortnameTaken(client)(shortname))
      ) {
        throw new ApolloError(`Shortname ${shortname} taken`, "NAME_TAKEN");
      }

      /** @todo: enable admins to have a shortname under 4 characters */
      if (shortname.length < 4) {
        throw new UserInputError(
          "Shortname must be at least 4 characters long."
        );
      }
      if (shortname.length > 24) {
        throw new UserInputError(
          "Shortname cannot be longer than 24 characters"
        );
      }
    };

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateShortname = (db: DBClient) => async (updatedShortname: string) =>
    this.updateProperties(db)({
      ...this.properties,
      shortname: updatedShortname,
    });
}

export default __Account;
