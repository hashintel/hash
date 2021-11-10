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
  destinationEntityVersionId?: string;
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
  linkId: string;
  path: string;
  sourceAccountId: string;
  sourceEntityId: string;
  sourceEntityVersionIds: Set<string>;
  destinationAccountId: string;
  destinationEntityId: string;
  destinationEntityVersionId?: string;
  createdAt: Date;
  source?: Entity;
  destination?: Entity;
};

class __Link {
  linkId: string;
  stringifiedPath: string;
  path: jp.PathComponent[];

  sourceAccountId: string;
  sourceEntityId: string;
  sourceEntityVersionIds: Set<string>;
  private source?: Entity;

  destinationAccountId: string;
  destinationEntityId: string;
  destinationEntityVersionId?: string;
  private destination?: Entity;

  createdAt: Date;

  constructor({
    linkId,
    path,
    sourceAccountId,
    sourceEntityId,
    sourceEntityVersionIds,
    destinationAccountId,
    destinationEntityId,
    destinationEntityVersionId,
    source,
    destination,
    createdAt,
  }: LinkConstructorArgs) {
    this.linkId = linkId;
    this.stringifiedPath = path;
    this.path = Link.parseStringifiedPath(path);
    this.sourceAccountId = sourceAccountId;
    this.sourceEntityId = sourceEntityId;
    this.sourceEntityVersionIds = sourceEntityVersionIds;
    this.destinationAccountId = destinationAccountId;
    this.destinationEntityId = destinationEntityId;
    this.destinationEntityVersionId = destinationEntityVersionId;
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
    const { stringifiedPath, source, destination, destinationEntityVersionId } =
      params;

    Link.validatePath(stringifiedPath);

    if (source.metadata.versioned) {
      /** @todo: implement a function dedicated to creating a new version of an entity and use it instead of this hack */
      await source.updateEntityProperties(client, source.properties);
    }

    /** @todo: check entity type to see if there is an inverse relatioship needs to be created */

    if (destinationEntityVersionId) {
      /** @todo: ensure destination entity has version where entityVersionId === destinationEntityVersionId */
    }

    const { accountId: sourceAccountId, entityId: sourceEntityId } = source;
    const { accountId: destinationAccountId, entityId: destinationEntityId } =
      destination;

    const dbLink = await client.createLink({
      path: stringifiedPath,
      sourceAccountId,
      sourceEntityId,
      sourceEntityVersionIds: new Set([source.entityVersionId]),
      destinationAccountId,
      destinationEntityId,
      destinationEntityVersionId,
    });

    const link = new Link({ ...dbLink, source, destination });

    return link;
  }

  static async get(
    client: DBClient,
    params: {
      sourceAccountId: string;
      linkId: string;
    },
  ): Promise<Link | null> {
    const dbLink = await client.getLink(params);
    return dbLink ? new Link({ ...dbLink }) : null;
  }

  async delete(client: DBClient) {
    await client.deleteLink({
      sourceAccountId: this.sourceAccountId,
      linkId: this.linkId,
    });

    if (this.source) {
      await this.source.refetchLatestVersion(client);
    }
  }

  private async fetchSource(client: DBClient) {
    const source = await Entity.getEntityLatestVersion(client, {
      accountId: this.sourceAccountId,
      entityId: this.sourceEntityId,
    });
    if (!source) {
      throw new Error(
        `Critical: couldn't find source entity of link with link id ${this.linkId}`,
      );
    }
    return source;
  }

  async getSource(client: DBClient) {
    this.source = this.source || (await this.fetchSource(client));
    return this.source;
  }

  private async fetchDestination(client: DBClient) {
    const destination = this.destinationEntityVersionId
      ? await Entity.getEntity(client, {
          accountId: this.destinationAccountId,
          entityVersionId: this.destinationEntityVersionId,
        })
      : await Entity.getEntityLatestVersion(client, {
          accountId: this.destinationAccountId,
          entityId: this.destinationEntityId,
        });
    if (!destination) {
      throw new Error(
        `Critical: couldn't find destination entity of link with link id ${this.linkId}`,
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
      sourceAccountId: this.sourceAccountId,
      sourceEntityId: this.sourceEntityId,
      destinationAccountId: this.destinationAccountId,
      destinationEntityId: this.destinationEntityId,
      destinationEntityVersionId: this.destinationEntityVersionId,
      path: this.stringifiedPath,
    };
  }
}

export default __Link;
