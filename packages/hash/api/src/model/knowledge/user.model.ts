import { GraphApi } from "@hashintel/hash-graph-client";
import {
  EntityModel,
  EntityModelConstructorParams,
  EntityModelCreateParams,
  EntityTypeModel,
  UserModel,
} from "..";
import {
  generateSchemaVersionedUri,
  workspaceAccountId,
  worskspaceTypesNamespaceUri,
} from "../util";

type UserProperties = {
  shortname?: string;
  emails: string[];
};

type UserModelConstructorParams = Omit<
  EntityModelConstructorParams,
  "properties"
> & {
  properties: UserProperties;
};

type UserModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "accountId"
> & {
  emails: string[];
  shortname?: string;
};

const userEntityTypeVersionedUri = generateSchemaVersionedUri({
  namespaceUri: worskspaceTypesNamespaceUri,
  kind: "entityType",
  title: "User",
  version: 1,
});

/**
 * @class {@link UserModel}
 */
export default class extends EntityModel {
  properties: UserProperties;

  constructor({ properties, ...args }: UserModelConstructorParams) {
    super({ properties, ...args });

    this.properties = properties;
  }

  /**
   * Get a workspace user entity by their shortname.
   *
   * @param params.shortname - the shortname of the user
   */
  static async getUserByShortname(
    graphApi: GraphApi,
    params: { shortname: string },
  ): Promise<UserModel | null> {
    /** @todo: use upcoming Graph API method to filter entities in the datastore */
    const { data: allEntities } = await graphApi.getLatestEntities();

    const matchingEntity = allEntities
      .filter(
        ({ typeVersionedUri }) =>
          typeVersionedUri === userEntityTypeVersionedUri,
      )
      .find(
        ({ inner }) =>
          (inner.properties as UserProperties).shortname === params.shortname,
      );

    if (matchingEntity) {
      const { identifier, inner } = matchingEntity;

      const { createdBy: accountId, version } = identifier;

      return new UserModel({
        accountId,
        entityId: identifier.entityId,
        version,
        entityTypeModel: await UserModel.getUserEntityType(graphApi),
        properties: inner.properties as UserProperties,
      });
    }

    return null;
  }

  static async getUserEntityType(graphApi: GraphApi): Promise<EntityTypeModel> {
    return await EntityTypeModel.get(graphApi, {
      versionedUri: userEntityTypeVersionedUri,
    });
  }

  /**
   * Create a workspace user entity.
   *
   * @param params.emails - the emails of the user
   * @param params.shortname - the shortname of the user
   */
  static async createUser(
    graphApi: GraphApi,
    params: UserModelCreateParams,
  ): Promise<UserModel> {
    const { emails, shortname } = params;

    // if setting a shortname, ensure it's unique across all workspace users
    if (shortname) {
      const existingUserWithShortname = await UserModel.getUserByShortname(
        graphApi,
        { shortname },
      );

      if (existingUserWithShortname) {
        throw new Error(
          `A user entity with shortname "${shortname}" already exists.`,
        );
      }

      /** @todo: also ensure shortname is unique amongst orgs */
    }

    const properties: UserProperties = {
      emails,
      shortname,
    };

    const entityTypeModel = await UserModel.getUserEntityType(graphApi);

    const accountId = workspaceAccountId;

    const { entityId, version } = await EntityModel.create(graphApi, {
      accountId,
      properties,
      entityTypeModel,
    });

    return new UserModel({
      accountId,
      entityId,
      version,
      entityTypeModel,
      properties,
    });
  }
}
