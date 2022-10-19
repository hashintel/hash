import { AxiosError } from "axios";

import { LinkType } from "@blockprotocol/type-system-web";
import {
  GraphApi,
  PersistedLinkType,
  UpdateLinkTypeRequest,
} from "@hashintel/hash-graph-client";
import { generateTypeId } from "@hashintel/hash-shared/types";
import { LinkTypeModel } from "../index";
import { getNamespaceOfAccountOwner } from "./util";

type LinkTypeModelConstructorParams = {
  ownedById: string;
  schema: LinkType;
  createdById: string;
  updatedById: string;
  removedById?: string;
};

/**
 * @class {@link LinkTypeModel}
 */
export default class {
  ownedById: string;

  schema: LinkType;

  createdById: string;
  updatedById: string;
  removedById?: string;

  constructor({
    schema,
    ownedById,
    createdById,
    updatedById,
    removedById,
  }: LinkTypeModelConstructorParams) {
    this.ownedById = ownedById;
    this.schema = schema;
    this.createdById = createdById;
    this.updatedById = updatedById;
    this.removedById = removedById;
  }

  static fromPersistedLinkType({
    inner,
    metadata: { identifier, createdById, updatedById, removedById },
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
      createdById,
      updatedById,
      removedById,
    });
  }

  /**
   * Create a link type.
   *
   * @param params.ownedById - the id of the account who owns the link type
   * @param params.schema - the `LinkType`
   * @param params.actorId - the id of the account that is creating the link type
   */
  static async create(
    graphApi: GraphApi,
    params: {
      ownedById: string;
      schema: Omit<LinkType, "$id">;
      actorId: string;
    },
  ): Promise<LinkTypeModel> {
    const { ownedById, actorId } = params;
    const namespace = await getNamespaceOfAccountOwner(graphApi, {
      ownerId: ownedById,
    });

    const linkTypeId = generateTypeId({
      namespace,
      kind: "link-type",
      title: params.schema.title,
    });
    const fullLinkType = { $id: linkTypeId, ...params.schema };

    const { data: metadata } = await graphApi
      .createLinkType({
        schema: fullLinkType,
        ownedById,
        createdById: actorId,
      })
      .catch((err: AxiosError) => {
        throw new Error(
          err.response?.status === 409
            ? `link type with the same URI already exists. [URI=${fullLinkType.$id}]`
            : `[${err.code}] couldn't create link type: ${err.response?.data}.`,
        );
      });

    return LinkTypeModel.fromPersistedLinkType({
      inner: fullLinkType,
      metadata,
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
   * @param params.schema - the updated `LinkType`
   * @param params.actorId - the id of the account that is updating the link type
   */
  async update(
    graphApi: GraphApi,
    params: {
      schema: Omit<LinkType, "$id">;
      actorId: string;
    },
  ): Promise<LinkTypeModel> {
    const { schema, actorId } = params;
    const updateArguments: UpdateLinkTypeRequest = {
      typeToUpdate: this.schema.$id,
      schema,
      updatedById: actorId,
    };

    const { data: metadata } = await graphApi.updateLinkType(updateArguments);

    return LinkTypeModel.fromPersistedLinkType({
      inner: { ...schema, $id: metadata.identifier.uri },
      metadata,
    });
  }
}
