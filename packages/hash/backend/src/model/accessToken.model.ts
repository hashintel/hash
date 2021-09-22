import crypto from "crypto";
import { DBClient } from "../db";
import { Entity, EntityConstructorArgs } from ".";

export type DBAccessTokenProperties = {
  accessToken: string;
  revokedAt?: string;
};

export type AccessTokenConstructorArgs = {
  properties: DBAccessTokenProperties;
} & EntityConstructorArgs;

abstract class __AccessToken extends Entity {
  properties: DBAccessTokenProperties;

  constructor({ properties, ...remainingArgs }: AccessTokenConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static generateAccessToken = () => crypto.randomBytes(16).toString("hex");

  revoke = (client: DBClient) => {
    if (this.hasBeenRevoked()) {
      throw new Error(
        `${this.entityType.properties.title} access token with entityId ${this.entityId} has already been revoked`
      );
    }
    return this.updateProperties(client)({
      ...this.properties,
      revokedAt: new Date().toISOString(),
    });
  };

  hasBeenRevoked = (): boolean => !!this.properties.revokedAt;
}

export default __AccessToken;
