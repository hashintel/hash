import jp from "jsonpath";
import { UserInputError } from "apollo-server-errors";
import { DBClient } from "../db";
import { Entity, Link } from ".";
import { Link as GQLLink } from "../graphql/apiTypes.gen";

export type GQLLinkExternalResolvers = "__typename";

export type UnresolvedGQLLink = Omit<GQLLink, GQLLinkExternalResolvers>;

export type CreateLinkArgs = {
  stringifiedPath: string;
  source: Entity;
  destination: Entity;
  dstEntityVersionId?: string;
};

const SUPPORTED_JSONPATH_COMPONENT_TYPES = [
  "identifier", // e.g. .memberOf
  "numeric_literal", // e.g. [0]
  "string_literal", // e.g. ["memberOf"]
] as const;

type SupportedJSONPathComponentType =
  typeof SUPPORTED_JSONPATH_COMPONENT_TYPES[number];

type JSONPathComponent = {
  expression: {
    type: string;
    value: string | number;
  };
};

const isUnsupportedJSONPathComponent = (component: JSONPathComponent) =>
  !SUPPORTED_JSONPATH_COMPONENT_TYPES.includes(
    component.expression.type as SupportedJSONPathComponentType,
  );

const isUnupportedJSONPath = (components: JSONPathComponent[]) =>
  components.length < 2 ||
  components[0].expression.type !== "root" ||
  components.slice(1).find(isUnsupportedJSONPathComponent) !== undefined;

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
  stringifiedPath: string;
  path: jp.PathComponent[];

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
    this.stringifiedPath = path;
    this.path = Link.parseStringifiedPath(path);
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

  static isPathValid(path: string): boolean {
    try {
      const components = jp.parse(path) as JSONPathComponent[];

      if (isUnupportedJSONPath(components)) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  static parseStringifiedPath(stringifiedPath: string): jp.PathComponent[] {
    const components = jp.parse(stringifiedPath) as JSONPathComponent[];

    if (isUnupportedJSONPath(components)) {
      throw new Error(
        `Cannot parse unsupported JSON path "${stringifiedPath}""`,
      );
    }

    return components.slice(1).map(({ expression }) => expression.value);
  }

  static stringifyPath(path: jp.PathComponent[]) {
    return jp.stringify(path);
  }

  static validatePath(path: string) {
    if (!Link.isPathValid(path)) {
      throw new UserInputError(`"${path}" is not a valid JSON path`);
    }
  }

  static async create(client: DBClient, params: CreateLinkArgs): Promise<Link> {
    const { stringifiedPath, source, destination, dstEntityVersionId } = params;

    Link.validatePath(stringifiedPath);

    if (source.metadata.versioned) {
      /** @todo: implement a function dedicated to creating a new version of an entity and use it instead of this hack */
      await source.updateEntityProperties(client, source.properties);
    }

    /** @todo: check entity type to see if there is an inverse relatioship needs to be created */

    if (dstEntityVersionId) {
      /** @todo: ensure destination entity has version where entityVersionId === dstEntityVersionId */
    }

    const { accountId: srcAccountId, entityId: srcEntityId } = source;
    const { accountId: dstAccountId, entityId: dstEntityId } = destination;

    const dbLink = await client.createLink({
      accountId: source.accountId,
      path: stringifiedPath,
      srcAccountId,
      srcEntityId,
      srcEntityVersionIds: new Set([source.entityVersionId]),
      dstAccountId,
      dstEntityId,
      dstEntityVersionId,
    });

    const link = new Link({ ...dbLink, source, destination });

    return link;
  }

  static async get(
    client: DBClient,
    params: {
      accountId: string;
      linkId: string;
    },
  ): Promise<Link | null> {
    const dbLink = await client.getLink(params);
    return dbLink ? new Link({ ...dbLink }) : null;
  }

  async delete(client: DBClient) {
    await client.deleteLink({
      accountId: this.accountId,
      linkId: this.linkId,
    });

    if (this.source) {
      await this.source.refetchLatestVersion(client);
    }
  }

  private async fetchSource(client: DBClient) {
    const source = await Entity.getEntityLatestVersion(client, {
      accountId: this.accountId,
      entityId: this.srcEntityId,
    });
    if (!source) {
      throw new Error(
        `Critical: couldn't find source entity of link in account ${this.accountId} with link id ${this.linkId}`,
      );
    }
    return source;
  }

  async getSource(client: DBClient) {
    this.source = this.source || (await this.fetchSource(client));
    return this.source;
  }

  private async fetchDestination(client: DBClient) {
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
        `Critical: couldn't find destination entity of link in account ${this.accountId} with link id ${this.linkId}`,
      );
    }
    return destination;
  }

  async getDestination(client: DBClient) {
    this.destination =
      this.destination || (await this.fetchDestination(client));
    return this.destination;
  }

  toUnresolvedGQLLink(): UnresolvedGQLLink {
    return {
      id: this.linkId,
      sourceAccountId: this.srcAccountId,
      sourceEntityId: this.srcEntityId,
      destinationAccountId: this.dstAccountId,
      destinationEntityId: this.dstEntityId,
      destinationEntityVersionId: this.dstEntityVersionId,
      path: this.stringifiedPath,
    };
  }
}

export default __Link;
