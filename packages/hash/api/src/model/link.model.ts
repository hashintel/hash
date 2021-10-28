import jp from "jsonpath";
import { UserInputError } from "apollo-server-errors";
import { DBClient } from "../db";
import { Entity, Link } from ".";
import { Link as GQLLink } from "../graphql/apiTypes.gen";

export type GQLLinkExternalResolvers = "__typename";

export type UnresolvedGQLLink = Omit<GQLLink, GQLLinkExternalResolvers>;

type CreateLinkArgs = {
  path: string;
  source: Entity;
  destination: Entity;
  dstEntityVersionId?: string;
};

type LinkConstructorArgs = {
  accountId: string;
  linkId: string;
  path: string;
  srcAccountId: string;
  srcEntityId: string;
  srcEntityVersionIds: Set<string>;
  dstAccountId: string;
  dstEntityId: string;
  dstEntityVersionId?: string;
  createdAt: Date;
  source?: Entity;
  destination?: Entity;
};

class __Link {
  accountId: string;
  linkId: string;
  path: string;

  srcAccountId: string;
  srcEntityId: string;
  srcEntityVersionIds: Set<string>;
  private source?: Entity;

  dstAccountId: string;
  dstEntityId: string;
  dstEntityVersionId?: string;
  private destination?: Entity;

  createdAt: Date;

  constructor({
    accountId,
    linkId,
    path,
    srcAccountId,
    srcEntityId,
    srcEntityVersionIds,
    dstAccountId,
    dstEntityId,
    dstEntityVersionId,
    source,
    destination,
    createdAt,
  }: LinkConstructorArgs) {
    this.accountId = accountId;
    this.linkId = linkId;
    this.path = path;
    this.srcAccountId = srcAccountId;
    this.srcEntityId = srcEntityId;
    this.srcEntityVersionIds = srcEntityVersionIds;
    this.dstAccountId = dstAccountId;
    this.dstEntityId = dstEntityId;
    this.dstEntityVersionId = dstEntityVersionId;
    if (source) {
      this.source = source;
    }
    if (destination) {
      this.destination = destination;
    }
    this.createdAt = createdAt;
  }

  static isPathValid = (path: string): boolean => {
    try {
      jp.parse(path);
    } catch {
      return false;
    }
    return true;
  };

  static validatePath = (path: string) => {
    if (!Link.isPathValid(path)) {
      throw new UserInputError(`"${path}" is not a valid JSON path"`);
    }
  };

  static create =
    (client: DBClient) =>
    async (args: CreateLinkArgs): Promise<Link> => {
      const { path, source, destination, dstEntityVersionId } = args;

      /** @todo: ensure destination entity has version where entityVersionId === dstEntityVersionId */

      const { accountId: srcAccountId, entityId: srcEntityId } = source;
      const { accountId: dstAccountId, entityId: dstEntityId } = destination;

      const dbLink = await client.createLink({
        accountId: source.accountId,
        path,
        srcAccountId,
        srcEntityId,
        srcEntityVersionIds: new Set([source.entityVersionId]),
        dstAccountId,
        dstEntityId,
        dstEntityVersionId,
      });

      const link = new Link({ ...dbLink, source, destination });

      return link;
    };

  static get =
    (client: DBClient) =>
    async (args: {
      accountId: string;
      linkId: string;
    }): Promise<Link | null> => {
      const dbLink = await client.getLink(args);
      return dbLink ? new Link({ ...dbLink }) : null;
    };

  private fetchSource = async (client: DBClient) => {
    const source = await Entity.getEntityLatestVersion(client, {
      accountId: this.accountId,
      entityId: this.srcEntityId,
    });
    if (!source) {
      throw new Error(
        `Critical: couldn't find source entity of link in account ${this.accountId} with link id ${this.linkId}`
      );
    }
    return source;
  };

  getSource = async (client: DBClient) => {
    this.source = this.source || (await this.fetchSource(client));
    return this.source;
  };

  private fetchDestination = async (client: DBClient) => {
    const destination = this.dstEntityVersionId
      ? await Entity.getEntity(client, {
          accountId: this.accountId,
          entityVersionId: this.dstEntityVersionId,
        })
      : await Entity.getEntityLatestVersion(client, {
          accountId: this.accountId,
          entityId: this.srcEntityId,
        });
    if (!destination) {
      throw new Error(
        `Critical: couldn't find destination entity of link in account ${this.accountId} with link id ${this.linkId}`
      );
    }
    return destination;
  };

  getDestination = async (client: DBClient) => {
    this.destination =
      this.destination || (await this.fetchDestination(client));
    return this.destination;
  };

  toUnresolvedGQLLink = (): UnresolvedGQLLink => ({
    id: this.linkId,
    sourceAccountId: this.srcAccountId,
    sourceEntityId: this.srcEntityId,
    destinationAccountId: this.dstAccountId,
    destinationEntityId: this.dstEntityId,
    destinationEntityVersionId: this.dstEntityVersionId,
    path: this.path,
  });
}

export default __Link;
