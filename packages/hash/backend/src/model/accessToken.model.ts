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

  /**
   * Generates a cryptographically secure access token.
   * @returns the access token
   */
  static generateAccessToken = () => crypto.randomBytes(16).toString("hex");

  updateProperties(client: DBClient) {
    return (properties: any) =>
      super
        .updateProperties(client)(properties)
        .then(() => {
          this.properties = properties;
          return properties;
        });
  }

  /**
   * Revokes the access token, so that it can no longer be used.
   */
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

  /**
   * @returns whether or not the access token has been revoked.
   */
  hasBeenRevoked = (): boolean => !!this.properties.revokedAt;
}

export default __AccessToken;
