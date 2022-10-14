import { AxiosError } from "axios";

import { LinkType } from "@blockprotocol/type-system-web";
import {
  GraphApi,
  PersistedLinkType,
  UpdateLinkTypeRequest,
} from "@hashintel/hash-graph-client";

import { LinkTypeModel } from "../index";
import { generateTypeId } from "../util";
import { getNamespaceOfAccountOwner } from "./util";

type LinkTypeModelConstructorParams = {
  ownedById: string;
  schema: LinkType;
};

/**
 * @class {@link LinkTypeModel}
 */
export default class {
  ownedById: string;

  schema: LinkType;

  constructor({ schema, ownedById }: LinkTypeModelConstructorParams) {
    this.ownedById = ownedById;
    this.schema = schema;
  }

  static fromPersistedLinkType({
    inner,
    metadata: { identifier },
  }: PersistedLinkType): LinkTypeModel {
    /**
     * @todo and a warning, these type casts are here to compensate for
     *   the differences between the Graph API package and the
     *   type system package.
     *
     *   The type system package can be considered the source of truth in
     *   terms of the shape of values returned from the API, but the API
     *   client is unable to be given as type package types - it generates
     *   its own types.
     *   https://app.asana.com/0/1202805690238892/1202892835843657/f
     */
    return new LinkTypeModel({
      schema: inner as LinkType,
      ownedById: identifier.ownedById,
    });
  }

  /**
   * Create a link type.
   *
   * @param params.ownedById the id of the owner creating the link type
   * @param params.schema a `LinkType`
   */
  static async create(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      schema: Omit<LinkType, "$id">;
    },
  ): Promise<LinkTypeModel> {
    const namespace = await getNamespaceOfAccountOwner(graphApi, {
      ownerId: params.ownedById,
    });

    const linkTypeId = generateTypeId({
      namespace,
      kind: "link-type",
      title: params.schema.title,
    });
    const fullLinkType = { $id: linkTypeId, ...params.schema };

    const { data: identifier } = await graphApi
      .createLinkType({
        /**
         * @todo: replace uses of `accountId` with `ownedById` in the Graph API
         * @see https://app.asana.com/0/1202805690238892/1203063463721791/f
         */
        accountId: params.ownedById,
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
      ownedById: identifier.ownedById,
    });
  }

  /**
   * Get all link types at their latest version.
   */
  static async getAllLatest(graphApi: GraphApi): Promise<LinkTypeModel[]> {
    /**
     * @todo: get all latest link types in specified account.
     *   This may mean implicitly filtering results by what an account is
     *   authorized to see.
     *   https://app.asana.com/0/1202805690238892/1202890446280569/f
     */
    const { data: persistedLinkTypes } = await graphApi.getLatestLinkTypes();

    return persistedLinkTypes.map(LinkTypeModel.fromPersistedLinkType);
  }

  /**
   * Get a link type by its versioned URI.
   *
   * @param params.linkTypeId the unique versioned URI for a link type.
   */
  static async get(
    graphApi: GraphApi,
    params: {
      linkTypeId: string;
    },
  ): Promise<LinkTypeModel> {
    const { linkTypeId } = params;
    const { data: persistedLinkType } = await graphApi.getLinkType(linkTypeId);

    return LinkTypeModel.fromPersistedLinkType(persistedLinkType);
  }

  /**
   * Update a link type.
   *
   * @param params.schema a `LinkType`
   */
  async update(
    graphApi: GraphApi,
    params: {
      schema: Omit<LinkType, "$id">;
    },
  ): Promise<LinkTypeModel> {
    const { schema } = params;
    const updateArguments: UpdateLinkTypeRequest = {
      /**
       * @todo: let caller update who owns the type, or create new method dedicated to changing the owner of the type
       * @see https://app.asana.com/0/1202805690238892/1203063463721793/f
       *
       * @todo: replace uses of `accountId` with `ownedById` in the Graph API
       * @see https://app.asana.com/0/1202805690238892/1203063463721791/f
       */
      accountId: this.ownedById,
      typeToUpdate: this.schema.$id,
      schema,
    };

    const { data: identifier } = await graphApi.updateLinkType(updateArguments);

    return new LinkTypeModel({
      schema: { ...schema, $id: identifier.uri },
      ownedById: identifier.ownedById,
    });
  }
}
