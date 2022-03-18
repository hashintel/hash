import { ApolloError, UserInputError } from "apollo-server-express";

import {
  Account,
  Entity,
  EntityConstructorArgs,
  Org,
  PartialPropertiesUpdatePayload,
  UpdatePropertiesPayload,
  User,
} from ".";
import { DbClient } from "../db";
import { RESTRICTED_SHORTNAMES } from "./util";
import { DbOrgProperties, DbUserProperties } from "../db/adapter";

export const ALLOWED_SHORTNAME_CHARS = /^[a-zA-Z0-9-_]+$/;

type DbAccountProperties = DbUserProperties | DbOrgProperties;

export type AccountConstructorArgs = {
  properties: DbAccountProperties;
} & EntityConstructorArgs;

abstract class __Account extends Entity {
  protected partialPropertiesUpdate(
    client: DbClient,
    params: PartialPropertiesUpdatePayload<DbAccountProperties>,
  ) {
    return super.partialPropertiesUpdate(client, params);
  }

  protected updateProperties(
    client: DbClient,
    params: UpdatePropertiesPayload<DbAccountProperties>,
  ) {
    return super.updateProperties(client, params);
  }

  static async getAll(client: DbClient): Promise<(User | Org)[]> {
    const accountDbEntities = await client.getAllAccounts();

    return accountDbEntities.map((dbEntity) =>
      dbEntity.entityTypeName === "User"
        ? new User(dbEntity)
        : new Org(dbEntity),
    );
  }

  static async accountExists(
    client: DbClient,
    accountId: string,
  ): Promise<boolean> {
    return await client.accountExists({
      accountId,
    });
  }

  static isEntityAnAccount(entity: Entity): boolean {
    return entity.accountId === entity.entityId;
  }

  private static checkShortnameChars(shortname: string) {
    if (shortname.search(ALLOWED_SHORTNAME_CHARS)) {
      throw new UserInputError(
        "Shortname may only contain letters, numbers, - or _",
      );
    }
    if (shortname[0] === "-") {
      throw new UserInputError("Shortname cannot start with '-'");
    }
  }

  static isShortnameReserved(shortname: string): boolean {
    return RESTRICTED_SHORTNAMES.includes(shortname);
  }

  static async isShortnameTaken(
    client: DbClient,
    shortname: string,
  ): Promise<boolean> {
    const [org, user] = await Promise.all([
      await Org.getOrgByShortname(client, { shortname }),
      await User.getUserByShortname(client, { shortname }),
    ]);

    return org !== null || user !== null;
  }

  static async validateShortname(client: DbClient, shortname: string) {
    Account.checkShortnameChars(shortname);

    if (
      Account.isShortnameReserved(shortname) ||
      (await Account.isShortnameTaken(client, shortname))
    ) {
      throw new ApolloError(`Shortname ${shortname} taken`, "NAME_TAKEN");
    }

    /** @todo: enable admins to have a shortname under 4 characters */
    if (shortname.length < 4) {
      throw new UserInputError("Shortname must be at least 4 characters long.");
    }
    if (shortname.length > 24) {
      throw new UserInputError("Shortname cannot be longer than 24 characters");
    }
  }

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateShortname(
    db: DbClient,
    params: {
      updatedByAccountId: string;
      updatedShortname: string;
    },
  ) {
    return this.partialPropertiesUpdate(db, {
      updatedByAccountId: params.updatedByAccountId,
      properties: {
        shortname: params.updatedShortname,
      },
    });
  }
}

export default __Account;
