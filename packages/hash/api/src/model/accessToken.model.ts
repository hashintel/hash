import crypto from "crypto";
import { DbClient } from "../db";
import {
  Entity,
  EntityConstructorArgs,
  PartialPropertiesUpdatePayload,
  UpdatePropertiesPayload,
} from ".";

export type DbAccessTokenProperties = {
  accessToken: string;
  revokedAt?: string;
};

export type AccessTokenConstructorArgs = {
  properties: DbAccessTokenProperties;
} & EntityConstructorArgs;

abstract class __AccessToken extends Entity {
  properties: DbAccessTokenProperties;

  constructor({ properties, ...remainingArgs }: AccessTokenConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  /**
   * Generates a cryptographically secure access token.
   * @returns the access token
   */
  static generateAccessToken() {
    return crypto.randomBytes(16).toString("hex");
  }

  protected async partialPropertiesUpdate(
    client: DbClient,
    params: PartialPropertiesUpdatePayload<DbAccessTokenProperties>,
  ) {
    return super.partialPropertiesUpdate(client, params);
  }

  protected async updateProperties(
    client: DbClient,
    params: UpdatePropertiesPayload<DbAccessTokenProperties>,
  ) {
    await super.updateProperties(client, params);
    this.properties = params.properties;
    return params.properties;
  }

  /**
   * Revokes the access token, so that it can no longer be used.
   */
  revoke(client: DbClient, updatedByAccountId: string) {
    if (this.hasBeenRevoked()) {
      throw new Error(
        `${this.entityType.properties.title} access token with entityId ${this.entityId} has already been revoked`,
      );
    }
    return this.partialPropertiesUpdate(client, {
      updatedByAccountId,
      properties: {
        revokedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * @returns whether or not the access token has been revoked.
   */
  hasBeenRevoked(): boolean {
    return !!this.properties.revokedAt;
  }
}

export default __AccessToken;
