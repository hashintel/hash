import { LinkType, GraphApi } from "@hashintel/hash-graph-client";

import { LinkTypeModel } from "../index";

type LinkTypeModelConstructorArgs = {
  accountId: string;
  schema: LinkType;
};

/**
 * @class {@link LinkTypeModel}
 */
export default class {
  accountId: string;

  schema: LinkType;

  constructor({ schema, accountId }: LinkTypeModelConstructorArgs) {
    this.accountId = accountId;
    this.schema = schema;
  }

  /**
   * Create a link type.
   *
   * @param params.accountId the accountId of the account creating the link type
   * @param params.schema a `LinkType`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: LinkType;
    },
  ): Promise<LinkTypeModel> {
    const { data: schema } = await graphApi.createLinkType(params);

    return new LinkTypeModel({ schema, accountId: params.accountId });
  }

  /**
   * Get all link types at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the link types
   */
  static async getAllLatest(
    graphApi: GraphApi,
    params: { accountId: string },
  ): Promise<LinkTypeModel[]> {
    /** @todo: get all latest link types in specified account */
    const { data: schemas } = await graphApi.getLatestLinkTypes();

    return schemas.map(
      (schema) => new LinkTypeModel({ schema, accountId: params.accountId }),
    );
  }

  /**
   * Get a link type by its versioned URI.
   *
   * @param params.accountId the accountId of the account requesting the link type
   * @param params.versionedUri the unique versioned URI for a link type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      accountId: string;
      versionedUri: string;
    },
  ): Promise<LinkTypeModel> {
    const { accountId, versionedUri } = params;
    const { data: schema } = await graphApi.getLinkType(versionedUri);

    return new LinkTypeModel({ schema, accountId });
  }

  /**
   * Update a link type.
   *
   * @param params.accountId the accountId of the account making the update
   * @param params.schema a `LinkType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      accountId: string;
      schema: LinkType;
    },
  ): Promise<LinkTypeModel> {
    const { accountId } = params;

    const { data: schema } = await graphApi.updateLinkType(params);

    return new LinkTypeModel({ schema, accountId });
  }
}
