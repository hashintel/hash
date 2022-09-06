import { AxiosError } from "axios";

import { LinkType } from "@blockprotocol/type-system-web";
import { GraphApi, UpdateLinkTypeRequest } from "@hashintel/hash-graph-client";

import { LinkTypeModel, UserModel } from "../index";
import { generateSchemaUri, workspaceAccountId } from "../util";
import { WORKSPACE_ACCOUNT_SHORTNAME } from "@hashintel/hash-backend-utils/system";

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
      schema: Omit<LinkType, "$id">;
    },
  ): Promise<LinkTypeModel> {
    /** @todo - get rid of this hack for the root account */
    const namespace =
      params.accountId === workspaceAccountId
        ? WORKSPACE_ACCOUNT_SHORTNAME
        : (
            await UserModel.getUserByEntityId(graphApi, {
              entityId: params.accountId,
            })
          )?.getShortname();

    if (namespace == null) {
      throw new Error(
        `failed to get namespace for account: ${params.accountId}`,
      );
    }

    const linkTypeUri = generateSchemaUri({
      namespace,
      kind: "linkType",
      title: params.schema.title,
    });
    const fullLinkType = { $id: linkTypeUri, ...params.schema };

    const { data: identifier } = await graphApi
      .createLinkType({
        accountId: params.accountId,
        schema: fullLinkType,
      })
      .catch((err: AxiosError) => {
        throw new Error(
          err.response?.status === 409
            ? `link type with the same URI already exists. [URI=${fullLinkType.$id}]`
            : `[${err.code}] couldn't create link type: ${err.response?.data}.`,
        );
      });

    return new LinkTypeModel({
      schema: fullLinkType,
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
    /**
     * @todo: get all latest link types in specified account.
     *   This may mean implictly filtering results by what an account is
     *   authorized to see.
     *   https://app.asana.com/0/1202805690238892/1202890446280569/f
     */
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
      schema: Omit<LinkType, "$id">;
    },
  ): Promise<LinkTypeModel> {
    const { accountId, schema } = params;
    const updateArguments: UpdateLinkTypeRequest = {
      accountId,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: identifier } = await graphApi.updateLinkType(updateArguments);

    return new LinkTypeModel({
      schema: { ...schema, $id: identifier.uri },
      accountId: identifier.createdBy,
    });
  }
}
