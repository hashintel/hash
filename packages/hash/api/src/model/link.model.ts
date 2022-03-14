import jp from "jsonpath";
import { UserInputError } from "apollo-server-errors";
import { merge } from "lodash";
import { DBClient } from "../db";
import { Entity, Link } from ".";
import { Link as GQLLink } from "../graphql/apiTypes.gen";

export type GQLLinkExternalResolvers = "__typename";

export type UnresolvedGQLLink = Omit<GQLLink, GQLLinkExternalResolvers>;

export type CreateLinkArgs = {
  createdByAccountId: string;
  stringifiedPath: string;
  index?: number;
  source: Entity;
  destination: Entity;
  destinationEntityVersionId?: string;
};

/**
 * The supported JSON path component types of a JSON path
 * associated with a link.
 *
 * Note: indices are not valid component types for the JSON path,
 * a single index can be associated with a link using the dedicated
 * `index` field
 */
const SUPPORTED_JSONPATH_COMPONENT_TYPES = [
  "identifier", // e.g. .memberOf
] as const;

type SupportedJSONPathComponentType =
  typeof SUPPORTED_JSONPATH_COMPONENT_TYPES[number];

export type JSONPathComponent = {
  expression: {
    type: string;
    value: string | number;
  };
};

const isUnsupportedJSONPathComponent = (component: JSONPathComponent) =>
  !SUPPORTED_JSONPATH_COMPONENT_TYPES.includes(
    component.expression.type as SupportedJSONPathComponentType,
  );

export const isUnupportedJSONPath = (components: JSONPathComponent[]) =>
  components.length < 2 ||
  components[0]!.expression.type !== "root" ||
  components.slice(1).find(isUnsupportedJSONPathComponent) !== undefined;

type LinkConstructorArgs = {
  linkId: string;
  linkVersionId: string;
  path: string;
  index?: number;
  sourceAccountId: string;
  sourceEntityId: string;
  appliedToSourceAt: Date;
  appliedToSourceByAccountId: string;
  removedFromSourceAt?: Date;
  removedFromSourceByAccountId?: string;
  destinationAccountId: string;
  destinationEntityId: string;
  destinationEntityVersionId?: string;
  updatedAt: Date;
  updatedByAccountId: string;
};

class __Link {
  linkId: string;
  linkVersionId: string;
  stringifiedPath: string;
  path: jp.PathComponent[];
  index?: number;

  sourceAccountId: string;
  sourceEntityId: string;

  appliedToSourceAt: Date;
  appliedToSourceByAccountId: string;
  removedFromSourceAt?: Date;
  removedFromSourceByAccountId?: string;

  destinationAccountId: string;
  destinationEntityId: string;
  destinationEntityVersionId?: string;

  updatedAt: Date;
  updatedByAccountId: string;

  constructor({
    linkId,
    linkVersionId,
    path,
    index,
    sourceAccountId,
    sourceEntityId,
    appliedToSourceAt,
    appliedToSourceByAccountId,
    removedFromSourceAt,
    removedFromSourceByAccountId,
    destinationAccountId,
    destinationEntityId,
    destinationEntityVersionId,
    updatedAt,
    updatedByAccountId,
  }: LinkConstructorArgs) {
    this.linkId = linkId;
    this.linkVersionId = linkVersionId;
    this.stringifiedPath = path;
    this.path = Link.parseStringifiedPath(path);
    this.index = index;
    this.sourceAccountId = sourceAccountId;
    this.sourceEntityId = sourceEntityId;
    this.appliedToSourceAt = appliedToSourceAt;
    this.appliedToSourceByAccountId = appliedToSourceByAccountId;
    this.removedFromSourceAt = removedFromSourceAt;
    this.removedFromSourceByAccountId = removedFromSourceByAccountId;
    this.destinationAccountId = destinationAccountId;
    this.destinationEntityId = destinationEntityId;
    this.destinationEntityVersionId = destinationEntityVersionId;
    this.updatedAt = updatedAt;
    this.updatedByAccountId = updatedByAccountId;
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
    const {
      stringifiedPath,
      source,
      destination,
      destinationEntityVersionId,
      index,
    } = params;

    Link.validatePath(stringifiedPath);

    /** @todo: check entity type to see if there is an inverse relationship needs to be created */

    if (destinationEntityVersionId) {
      /** @todo: ensure destination entity has version where entityVersionId === destinationEntityVersionId */
    }

    const { accountId: sourceAccountId, entityId: sourceEntityId } = source;
    const { accountId: destinationAccountId, entityId: destinationEntityId } =
      destination;

    const dbLink = await client.createLink({
      ...params,
      path: stringifiedPath,
      sourceAccountId,
      sourceEntityId,
      sourceEntityVersionIds: new Set([source.entityVersionId]),
      destinationAccountId,
      destinationEntityId,
      destinationEntityVersionId,
      index,
    });

    const link = new Link(dbLink);

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
    return dbLink ? new Link(dbLink) : null;
  }

  async delete(client: DBClient, params: { deletedByAccountId: string }) {
    await client.deleteLink({
      deletedByAccountId: params.deletedByAccountId,
      sourceAccountId: this.sourceAccountId,
      linkId: this.linkId,
    });
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
    return await this.fetchSource(client);
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
    return await this.fetchDestination(client);
  }

  async update(
    client: DBClient,
    params: { updatedIndex: number; updatedByAccountId: string },
  ) {
    const { updatedIndex, updatedByAccountId } = params;

    /** @todo: implement way of updating a link's index without deleting the current one and creating a new one */

    const [source, destination] = await Promise.all([
      this.getSource(client),
      this.getDestination(client),
      this.delete(client, { deletedByAccountId: updatedByAccountId }),
    ]);

    const newLink = await Link.create(client, {
      source,
      destination,
      index: updatedIndex,
      stringifiedPath: this.stringifiedPath,
      createdByAccountId: updatedByAccountId,
    });

    merge(this, newLink);

    return this;
  }

  toUnresolvedGQLLink(): UnresolvedGQLLink {
    return {
      linkId: this.linkId,
      sourceAccountId: this.sourceAccountId,
      sourceEntityId: this.sourceEntityId,
      destinationAccountId: this.destinationAccountId,
      destinationEntityId: this.destinationEntityId,
      destinationEntityVersionId: this.destinationEntityVersionId,
      path: this.stringifiedPath,
      index: this.index,
    };
  }
}

export default __Link;
