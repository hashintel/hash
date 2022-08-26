import { GraphApi } from "@hashintel/hash-graph-client";
import {
  EntityModel,
  EntityModelCreateParams,
  EntityTypeModel,
  UserModel,
} from "..";
import {
  adminKratosSdk,
  KratosUserIdentity,
  KratosUserIdentityTraits,
} from "../../auth/ory-kratos";
import {
  generateSchemaBaseUri,
  generateWorkspaceEntityTypeSchema,
  generateWorkspacePropertyTypeSchema,
  workspaceAccountId,
  workspaceTypesNamespaceUri,
} from "../util";
import { AccountUtil } from "./account.util";

type QualifiedEmail = { address: string; verified: boolean; primary: boolean };

// Generate the schema for the email property type
export const emailPropertyType = generateWorkspacePropertyTypeSchema({
  title: "Email",
  possibleValues: [{ primitiveDataType: "Text" }],
});

// Generate the schema for the kratos identity property type
export const kratosIdentityIdPropertyType = generateWorkspacePropertyTypeSchema(
  {
    title: "Kratos Identity ID",
    possibleValues: [{ primitiveDataType: "Text" }],
  },
);

// Generate the schema for the preferred name property type
export const preferredNamePropertyType = generateWorkspacePropertyTypeSchema({
  title: "Preferred Name",
  possibleValues: [{ primitiveDataType: "Text" }],
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
};

// Generate the schema for the user entity type
export const userEntityType = generateWorkspaceEntityTypeSchema({
  title: "User",
  properties: [
    {
      baseUri: AccountUtil.shortnameBaseUri,
      versionedUri: AccountUtil.shortnamePropertyType.$id,
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
      baseUri: AccountUtil.accountIdBaseUri,
      versionedUri: AccountUtil.accountIdPropertyType.$id,
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
   * Get a workspace user entity by their entityId.
   *
   * @param params.entityId - the entityId of the user
   */
  static async getUserByEntityId(
    graphApi: GraphApi,
    params: { entityId: string },
  ): Promise<UserModel | null> {
    const { entityId } = params;

    const entityModel = await EntityModel.getLatest(graphApi, {
      accountId: workspaceAccountId,
      entityId,
    });

    return new UserModel(entityModel);
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
    /**
     * @todo: use upcoming Graph API method to filter entities in the datastore
     *   https://app.asana.com/0/1202805690238892/1202890614880643/f
     */
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
    /**
     * @todo: use upcoming Graph API method to filter entities in the datastore
     *   https://app.asana.com/0/1202805690238892/1202890614880643/f
     */
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
   */
  static async createUser(
    graphApi: GraphApi,
    params: UserModelCreateParams,
  ): Promise<UserModel> {
    const { emails, kratosIdentityId } = params;

    const existingUserWithKratosIdentityId =
      await UserModel.getUserByKratosIdentityId(graphApi, {
        kratosIdentityId,
      });

    if (existingUserWithKratosIdentityId) {
      throw new Error(
        `A user entity with kratos identity id "${kratosIdentityId}" already exists.`,
      );
    }

    const { data: userAccountId } = await graphApi.createAccountId();

    const properties: object = {
      [emailBaseUri]: emails,
      [kratosIdentityIdBaseUri]: kratosIdentityId,
      [AccountUtil.accountIdBaseUri]: userAccountId,
      [AccountUtil.shortnameBaseUri]: undefined,
      [preferredNameBaseUri]: undefined,
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

  async updateKratosIdentityTraits(
    updatedTraits: Partial<KratosUserIdentityTraits>,
  ) {
    const {
      id: kratosIdentityId,
      traits: currentKratosTraits,
      schema_id,
      state,
    } = await this.getKratosIdentity();

    /** @todo: figure out why the `state` can be undefined */
    if (!state) {
      throw new Error("Previous user identity state is undefined");
    }

    await adminKratosSdk.adminUpdateIdentity(kratosIdentityId, {
      schema_id,
      state,
      traits: {
        ...currentKratosTraits,
        ...updatedTraits,
      },
    });
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
    return (this.properties as any)[AccountUtil.shortnameBaseUri];
  }

  async updateShortname(
    graphApi: GraphApi,
    params: { updatedByAccountId: string; updatedShortname: string },
  ): Promise<UserModel> {
    const { updatedByAccountId, updatedShortname } = params;

    if (AccountUtil.shortnameIsInvalid(updatedShortname)) {
      throw new Error(`The shortname "${updatedShortname}" is invalid`);
    }

    if (
      AccountUtil.shortnameIsRestricted(updatedShortname) ||
      (await AccountUtil.shortnameIsTaken(graphApi, {
        shortname: updatedShortname,
      }))
    ) {
      throw new Error(
        `A user entity with shortname "${updatedShortname}" already exists.`,
      );
    }

    const previousShortname = this.getShortname();

    const updatedUser = await this.updateProperty(graphApi, {
      propertyTypeBaseUri: AccountUtil.shortnameBaseUri,
      value: updatedShortname,
      updatedByAccountId,
    }).then((updatedEntity) => new UserModel(updatedEntity));

    await this.updateKratosIdentityTraits({
      shortname: updatedShortname,
    }).catch(async (error) => {
      // If an error occurred updating the entity, set the property to have the previous shortname
      await this.updateProperty(graphApi, {
        propertyTypeBaseUri: AccountUtil.shortnameBaseUri,
        value: previousShortname,
        updatedByAccountId,
      });

      return Promise.reject(error);
    });

    return updatedUser;
  }

  getPreferredName(): string | undefined {
    return (this.properties as any)[preferredNameBaseUri];
  }

  static preferredNameIsInvalid(preferredName: string) {
    return preferredName === "";
  }

  async updatePreferredName(
    graphApi: GraphApi,
    params: { updatedByAccountId: string; updatedPreferredName: string },
  ) {
    const { updatedByAccountId, updatedPreferredName } = params;

    if (UserModel.preferredNameIsInvalid(updatedPreferredName)) {
      throw new Error(`Preferred name "${updatedPreferredName}" is invalid.`);
    }

    const updatedEntity = await this.updateProperty(graphApi, {
      propertyTypeBaseUri: preferredNameBaseUri,
      value: updatedPreferredName,
      updatedByAccountId,
    });

    return new UserModel(updatedEntity);
  }

  getKratosIdentityId(): string {
    return (this.properties as any)[kratosIdentityIdBaseUri];
  }

  getAccountId(): string {
    return (this.properties as any)[AccountUtil.accountIdBaseUri];
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
    /** @todo: check they have a verified email address */
    return !!this.getShortname() && !!this.getPreferredName();
  }
}
