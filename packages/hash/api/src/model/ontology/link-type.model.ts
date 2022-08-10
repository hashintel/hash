import { LinkType, GraphApi } from "@hashintel/hash-graph-client";

import { LinkTypeModel } from "../index";

type LinkTypeModelConstructorParams = {
  accountId: string;
  schema: LinkType;
};

/**
 * @class {@link LinkTypeModel}
 */
export default class {
  accountId: string;

  schema: LinkType;

  constructor({ schema, accountId }: LinkTypeModelConstructorParams) {
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
    const { data: identifier } = await graphApi.createLinkType(params);

    return new LinkTypeModel({
      schema: params.schema,
      accountId: identifier.createdBy,
    });
  }

  /**
   * Get all link types at their latest version.
   *
   * @param params.accountId the accountId of the account requesting the link types
   */
  static async getAllLatest(
    graphApi: GraphApi,
    _params: { accountId: string },
  ): Promise<LinkTypeModel[]> {
    /** @todo: get all latest link types in specified account */
    const { data: persistedLinkTypes } = await graphApi.getLatestLinkTypes();

    return persistedLinkTypes.map(
      (persistedLinkType) =>
        new LinkTypeModel({
          schema: persistedLinkType.inner,
          accountId: persistedLinkType.identifier.createdBy,
        }),
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
      versionedUri: string;
    },
  ): Promise<LinkTypeModel> {
    const { versionedUri } = params;
    const { data: persistedLinkType } = await graphApi.getLinkType(
      versionedUri,
    );

    return new LinkTypeModel({
      schema: persistedLinkType.inner,
      accountId: persistedLinkType.identifier.createdBy,
    });
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
    const { data: identifier } = await graphApi.updateLinkType(params);

    return new LinkTypeModel({
      schema: params.schema,
      accountId: identifier.createdBy,
    });
  }
}
