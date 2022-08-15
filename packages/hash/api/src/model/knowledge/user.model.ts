import { GraphApi } from "@hashintel/hash-graph-client";
import {
  EntityModel,
  EntityModelCreateParams,
  EntityTypeModel,
  UserModel,
} from "..";
import { adminKratosSdk, KratosUserIdentity } from "../../auth/ory-kratos";
import {
  generateSchemaBaseUri,
  generateWorkspaceEntityTypeSchema,
  generateWorkspacePropertyTypeSchema,
  workspaceAccountId,
  workspaceTypesNamespaceUri,
} from "../util";

type QualifiedEmail = { address: string; verified: boolean; primary: boolean };

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

// Generate the schema for the shortname property type
export const kratosIdentityIdPropertyType = generateWorkspacePropertyTypeSchema(
  {
    title: "Kratos Identity ID",
    possibleValues: [{ primitiveDataType: "Text" }],
  },
);

// Generate the schema for the shortname property type
export const accountIdPropertyType = generateWorkspacePropertyTypeSchema({
  title: "Account ID",
  possibleValues: [{ primitiveDataType: "Text" }],
});

// Generate the schema for the shortname property type
export const preferredNamePropertyType = generateWorkspacePropertyTypeSchema({
  title: "Preferred Name",
  possibleValues: [{ primitiveDataType: "Text" }],
});

export const shortnameBaseUri = generateSchemaBaseUri({
  namespaceUri: workspaceTypesNamespaceUri,
  kind: "propertyType",
  title: shortnamePropertyType.title,
});

export const emailBaseUri = generateSchemaBaseUri({
  namespaceUri: workspaceTypesNamespaceUri,
  kind: "propertyType",
  title: emailPropertyType.title,
});

export const kratosIdentityIdBaseUri = generateSchemaBaseUri({
  namespaceUri: workspaceTypesNamespaceUri,
  kind: "propertyType",
  title: kratosIdentityIdPropertyType.title,
});

export const accountIdBaseUri = generateSchemaBaseUri({
  namespaceUri: workspaceTypesNamespaceUri,
  kind: "propertyType",
  title: accountIdPropertyType.title,
});

export const preferredNameBaseUri = generateSchemaBaseUri({
  namespaceUri: workspaceTypesNamespaceUri,
  kind: "propertyType",
  title: preferredNamePropertyType.title,
});

type UserModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "accountId"
> & {
  emails: string[];
  kratosIdentityId: string;
  shortname?: string;
  preferredName?: string;
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
    {
      baseUri: kratosIdentityIdBaseUri,
      versionedUri: kratosIdentityIdPropertyType.$id,
      required: true,
    },
    {
      baseUri: accountIdBaseUri,
      versionedUri: accountIdPropertyType.$id,
      required: true,
    },
    {
      baseUri: preferredNameBaseUri,
      versionedUri: preferredNamePropertyType.$id,
      required: true,
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

    const matchingUser = allEntities
      .filter(
        ({ entityTypeModel }) =>
          entityTypeModel.schema.$id === userEntityTypeVersionedUri,
      )
      .map((entityModel) => new UserModel(entityModel))
      .find((user) => user.getShortname() === params.shortname);

    return matchingUser ?? null;
  }

  /**
   * Get a workspace user entity by their kratos identity id.
   *
   * @param params.kratosIdentityId - the kratos identity id
   */
  static async getUserByKratosIdentityId(
    graphApi: GraphApi,
    params: { kratosIdentityId: string },
  ): Promise<UserModel | null> {
    /** @todo: use upcoming Graph API method to filter entities in the datastore */
    const allEntities = await EntityModel.getAllLatest(graphApi, {
      accountId: workspaceAccountId,
    });

    const matchingUser = allEntities
      .filter(
        ({ entityTypeModel }) =>
          entityTypeModel.schema.$id === userEntityTypeVersionedUri,
      )
      .map((entityModel) => new UserModel(entityModel))
      .find((user) => user.getKratosIdentityId() === params.kratosIdentityId);

    return matchingUser ?? null;
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
   * @param params.kratosIdentityId - the kratos identity id of the user
   * @param params.shortname - the shortname of the user
   * @param params.preferredName - the preferred name of the user
   */
  static async createUser(
    graphApi: GraphApi,
    params: UserModelCreateParams,
  ): Promise<UserModel> {
    const { emails, shortname, preferredName, kratosIdentityId } = params;

    const existingUserWithKratosIdentityId =
      await UserModel.getUserByKratosIdentityId(graphApi, {
        kratosIdentityId,
      });

    if (existingUserWithKratosIdentityId) {
      throw new Error(
        `A user entity with kratos identity id "${kratosIdentityId}" already exists.`,
      );
    }

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

    const userAccountId = graphApi.createAccountId();

    const properties: object = {
      [emailBaseUri]: emails,
      [shortnameBaseUri]: shortname,
      [kratosIdentityIdBaseUri]: kratosIdentityId,
      [accountIdBaseUri]: userAccountId,
      [preferredNameBaseUri]: preferredName,
    };

    const entityTypeModel = await UserModel.getUserEntityType(graphApi);

    const userEntityAccountId = workspaceAccountId;

    const { entityId, version } = await EntityModel.create(graphApi, {
      accountId: workspaceAccountId,
      properties,
      entityTypeModel,
    });

    return new UserModel({
      accountId: userEntityAccountId,
      entityId,
      version,
      entityTypeModel,
      properties,
    });
  }

  /**
   * Get the kratos identity associated with the user.
   */
  async getKratosIdentity(): Promise<KratosUserIdentity> {
    const kratosIdentityId = this.getKratosIdentityId();
    const { data: kratosIdentity } = await adminKratosSdk.adminGetIdentity(
      kratosIdentityId,
    );

    return kratosIdentity;
  }

  async getQualifiedEmails(): Promise<QualifiedEmail[]> {
    const emails: string[] = (this.properties as any)[emailBaseUri];

    const kratosIdentity = await this.getKratosIdentity();

    return emails.map((address) => {
      const kratosEmail = kratosIdentity.verifiable_addresses?.find(
        ({ value }) => value === address,
      );

      if (!kratosEmail) {
        throw new Error(
          "Could not find verifiable email address in kratos identity",
        );
      }

      const { verified } = kratosEmail;

      return {
        address,
        verified,
        /** @todo: stop hardcoding this */
        primary: true,
      };
    });
  }

  getEmails(): string[] {
    return (this.properties as any)[emailBaseUri];
  }

  getShortname(): string | undefined {
    return (this.properties as any)[shortnameBaseUri];
  }

  async updateShortname(
    _graphApi: GraphApi,
    _params: { updatedByAccountId: string; updatedShortname: string },
  ) {
    /** @todo: re-implement this method */
    throw new Error("user.updateShortname is not yet re-implemented");
  }

  getPreferredName(): string | undefined {
    return (this.properties as any)[preferredNameBaseUri];
  }

  async updatePreferredName(
    _graphApi: GraphApi,
    _params: { updatedByAccountId: string; updatedPreferredName: string },
  ) {
    /** @todo: re-implement this method */
    throw new Error("user.updatePreferredName is not yet re-implemented");
  }

  getKratosIdentityId(): string {
    return (this.properties as any)[kratosIdentityIdBaseUri];
  }

  getAccountId(): string {
    return (this.properties as any)[accountIdBaseUri];
  }

  getInfoProvidedAtSignup(): any {
    throw new Error("user.getInfoProvidedAtSignup is not yet re-implemented");
  }

  async updateInfoProvidedAtSignup(
    _graphApi: GraphApi,
    _params: { updatedByAccountId: string; updatedInfo: any },
  ) {
    /** @todo: re-implement this method */
    throw new Error(
      "user.updateInfoProvidedAtSignup is not yet re-implemented",
    );
  }

  async joinOrg(
    _graphApi: GraphApi,
    _params: { org: any; responsibility: string; updatedByAccountId: string },
  ) {
    /** @todo: re-implement this method */
    throw new Error("user.joinOrg is not yet re-implemented");
  }

  async isMemberOfOrg(
    _graphApi: GraphApi,
    _params: { orgEntityId: string },
  ): Promise<boolean> {
    /** @todo: re-implement this method */
    throw new Error("user.isMemberOfOrg is not yet re-implemented");
  }

  isAccountSignupComplete(): boolean {
    return !!this.getShortname() && !!this.getPreferredName();
  }
}
