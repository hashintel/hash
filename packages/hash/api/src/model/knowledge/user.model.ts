import { GraphApi } from "@hashintel/hash-graph-client";
import {
  EntityModel,
  EntityModelCreateParams,
  EntityTypeModel,
  UserModel,
} from "..";
import {
  generateSchemaBaseUri,
  generateWorkspaceEntityTypeSchema,
  generateWorkspacePropertyTypeSchema,
  workspaceAccountId,
  worskspaceTypesNamespaceUri,
} from "../util";

// Generate the schema for the shortname property type
export const shortnamePropertyType = generateWorkspacePropertyTypeSchema({
  title: "Shortname",
  possibleValues: [{ primitiveDataType: "Text" }],
});

// Generate the schema for the email property type
export const emailPropertyType = generateWorkspacePropertyTypeSchema({
  title: "Email",
  possibleValues: [{ primitiveDataType: "Text" }],
});

export const shortnameBaseUri = generateSchemaBaseUri({
  namespaceUri: worskspaceTypesNamespaceUri,
  kind: "propertyType",
  title: shortnamePropertyType.title,
});

export const emailBaseUri = generateSchemaBaseUri({
  namespaceUri: worskspaceTypesNamespaceUri,
  kind: "propertyType",
  title: emailPropertyType.title,
});

type UserModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "accountId"
> & {
  emails: string[];
  shortname?: string;
};

// Generate the schema for the user entity type
export const userEntityType = generateWorkspaceEntityTypeSchema({
  title: "User",
  properties: [
    {
      baseUri: shortnameBaseUri,
      versionedUri: shortnamePropertyType.$id,
    },
    {
      baseUri: emailBaseUri,
      versionedUri: emailPropertyType.$id,
      required: true,
      array: { minItems: 1 },
    },
  ],
});

const userEntityTypeVersionedUri = userEntityType.$id;

/**
 * @class {@link UserModel}
 */
export default class extends EntityModel {
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
    const allEntities = await EntityModel.getAllLatest(graphApi, {
      accountId: workspaceAccountId,
    });

    const matchingEntity = allEntities
      .filter(
        ({ entityTypeModel }) =>
          entityTypeModel.schema.$id === userEntityTypeVersionedUri,
      )
      .find(
        ({ properties }) =>
          (properties as any)[shortnameBaseUri] === params.shortname,
      );

    return matchingEntity ? new UserModel(matchingEntity) : null;
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

    const properties: object = {
      [emailBaseUri]: emails,
      [shortnameBaseUri]: shortname,
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

  getEmails(): string[] {
    return (this.properties as any)[emailBaseUri];
  }

  getShortname(): string {
    return (this.properties as any)[shortnameBaseUri];
  }
}
