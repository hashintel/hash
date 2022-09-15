import { GraphApi } from "@hashintel/hash-graph-client";
import { AxiosError } from "axios";
import {
  EntityModel,
  UserModel,
  AccountFields,
  EntityModelCreateParams,
  OrgModel,
  OrgMembershipModel,
} from "..";
import {
  adminKratosSdk,
  KratosUserIdentity,
  KratosUserIdentityTraits,
} from "../../auth/ory-kratos";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";
import { extractBaseUri, workspaceAccountId } from "../util";

type QualifiedEmail = { address: string; verified: boolean; primary: boolean };

type UserModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "accountId"
> & {
  emails: string[];
  kratosIdentityId: string;
};

/**
 * @class {@link UserModel}
 */
export default class extends EntityModel {
  static async getUserByAccountId(
    graphApi: GraphApi,
    params: { accountId: string },
  ): Promise<UserModel | null> {
    /**
     * @todo: This method and `getUserByEntityId` is confusing. Should be fixed as part of:
     *  https://app.asana.com/0/1200211978612931/1202937382769276/f
     */
    const allEntities = await EntityModel.getAllLatest(graphApi, {
      accountId: workspaceAccountId,
    });

    const matchingUser = allEntities
      .filter(
        ({ entityTypeModel }) =>
          entityTypeModel.schema.$id ===
          WORKSPACE_TYPES.entityType.user.schema.$id,
      )
      .map((entityModel) => new UserModel(entityModel))
      .find((user) => user.entityId === params.accountId);

    return matchingUser ?? null;
  }

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
    }).catch((err: AxiosError) => {
      throw new Error(
        `failed to get user entity with id ${entityId}: ${err.code} ${err.response?.data}`,
      );
    });

    return new UserModel(entityModel);
  }

  /**
   * Get a workspace user entity by its entity id.
   *
   * @param params.entityId - the entity id of the user
   */
  static async getUserById(
    graphApi: GraphApi,
    params: { entityId: string },
  ): Promise<UserModel | null> {
    const entity = await EntityModel.getLatest(graphApi, {
      // assumption: `accountId` of user is always the workspace account id
      accountId: workspaceAccountId,
      entityId: params.entityId,
    });

    if (
      entity.entityTypeModel.schema.$id !==
      WORKSPACE_TYPES.entityType.user.schema.$id
    ) {
      throw new Error(
        `Entity with id ${params.entityId} is not a workspace user`,
      );
    }

    return entity ? new UserModel(entity) : null;
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
          entityTypeModel.schema.$id ===
          WORKSPACE_TYPES.entityType.user.schema.$id,
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
          entityTypeModel.schema.$id ===
          WORKSPACE_TYPES.entityType.user.schema.$id,
      )
      .map((entityModel) => new UserModel(entityModel))
      .find((user) => user.getKratosIdentityId() === params.kratosIdentityId);

    return matchingUser ?? null;
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
      [WORKSPACE_TYPES.propertyType.email.baseUri]: emails,
      [WORKSPACE_TYPES.propertyType.kratosIdentityId.baseUri]: kratosIdentityId,
      [WORKSPACE_TYPES.propertyType.shortName.baseUri]: undefined,
      [WORKSPACE_TYPES.propertyType.preferredName.baseUri]: undefined,
    };

    const entityTypeModel = WORKSPACE_TYPES.entityType.user;

    const userEntityAccountId = workspaceAccountId;

    const { entityId, version } = await EntityModel.create(graphApi, {
      accountId: workspaceAccountId,
      properties,
      entityTypeModel,
      entityId: userAccountId,
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
    const emails: string[] = (this.properties as any)[
      WORKSPACE_TYPES.propertyType.email.baseUri
    ];

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
    return (this.properties as any)[WORKSPACE_TYPES.propertyType.email.baseUri];
  }

  /**
   * @todo This is only undefined because of Users that are in the process of an uncompleted sign-up flow.
   * Otherwise this should be an invariant and always true. We should revisit how uninitialized users are represented
   * to avoid things like this:
   *
   * https://app.asana.com/0/1202805690238892/1202944961125764/f
   */
  getShortname(): string | undefined {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.shortName.baseUri
    ];
  }

  /**
   * Update the shortname of a User.
   *
   * @param params.updatedByAccountId - the account id of the user requesting the updating
   * @param params.updatedShortname - the new shortname to assign to the User
   */
  async updateShortname(
    graphApi: GraphApi,
    params: { updatedByAccountId: string; updatedShortname: string },
  ): Promise<UserModel> {
    const { updatedByAccountId, updatedShortname } = params;

    if (AccountFields.shortnameIsInvalid(updatedShortname)) {
      throw new Error(`The shortname "${updatedShortname}" is invalid`);
    }

    if (
      AccountFields.shortnameIsRestricted(updatedShortname) ||
      (await AccountFields.shortnameIsTaken(graphApi, {
        shortname: updatedShortname,
      }))
    ) {
      throw new Error(
        `A user entity with shortname "${updatedShortname}" already exists.`,
      );
    }

    const previousShortname = this.getShortname();

    const updatedUser = await this.updateProperty(graphApi, {
      propertyTypeBaseUri: WORKSPACE_TYPES.propertyType.shortName.baseUri,
      value: updatedShortname,
      updatedByAccountId,
    }).then((updatedEntity) => new UserModel(updatedEntity));

    await this.updateKratosIdentityTraits({
      shortname: updatedShortname,
    }).catch(async (error) => {
      // If an error occurred updating the entity, set the property to have the previous shortname
      await this.updateProperty(graphApi, {
        propertyTypeBaseUri: WORKSPACE_TYPES.propertyType.shortName.baseUri,
        value: previousShortname,
        updatedByAccountId,
      });

      return Promise.reject(error);
    });

    return updatedUser;
  }

  getPreferredName(): string | undefined {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.preferredName.baseUri
    ];
  }

  static preferredNameIsInvalid(preferredName: string) {
    return preferredName === "";
  }

  /**
   * Update the preferred name of a User.
   *
   * @param params.updatedByAccountId - the account id of the user requesting the updating
   * @param params.updatedPreferredName - the new preferred name to assign to the User
   */
  async updatePreferredName(
    graphApi: GraphApi,
    params: { updatedByAccountId: string; updatedPreferredName: string },
  ) {
    const { updatedByAccountId, updatedPreferredName } = params;

    if (UserModel.preferredNameIsInvalid(updatedPreferredName)) {
      throw new Error(`Preferred name "${updatedPreferredName}" is invalid.`);
    }

    const updatedEntity = await this.updateProperty(graphApi, {
      propertyTypeBaseUri: WORKSPACE_TYPES.propertyType.preferredName.baseUri,
      value: updatedPreferredName,
      updatedByAccountId,
    });

    return new UserModel(updatedEntity);
  }

  getKratosIdentityId(): string {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.kratosIdentityId.baseUri
    ];
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
    graphApi: GraphApi,
    params: {
      org: OrgModel;
      responsibility: string;
    },
  ) {
    const { org, responsibility } = params;

    const orgMembership = await OrgMembershipModel.createOrgMembership(
      graphApi,
      { responsibility, org },
    );

    await this.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.ofOrg,
      targetEntityModel: orgMembership,
    });
  }

  async getOrgMemberships(graphApi: GraphApi): Promise<OrgMembershipModel[]> {
    const { data: outgoingOrgMembershipLinks } = await graphApi.getLinksByQuery(
      {
        all: [
          {
            eq: [{ path: ["source", "id"] }, { literal: this.entityId }],
          },
          {
            eq: [
              { path: ["type", "uri"] },
              {
                literal: extractBaseUri(
                  WORKSPACE_TYPES.linkType.ofOrg.schema.$id,
                ),
              },
            ],
          },
        ],
      },
    );

    return await Promise.all(
      outgoingOrgMembershipLinks.map(async ({ targetEntityId }) => {
        const orgMembership = await OrgMembershipModel.getOrgMembershipById(
          graphApi,
          {
            entityId: targetEntityId,
          },
        );

        if (!orgMembership) {
          throw new Error("");
        }

        return orgMembership;
      }),
    );
  }

  async isMemberOfOrg(
    graphApi: GraphApi,
    params: { orgEntityId: string },
  ): Promise<boolean> {
    const orgMemberships = await this.getOrgMemberships(graphApi);

    const orgs = await Promise.all(
      orgMemberships.map((orgMembership) => orgMembership.getOrg(graphApi)),
    );

    return !!orgs.find(({ entityId }) => entityId === params.orgEntityId);
  }

  isAccountSignupComplete(): boolean {
    /** @todo: check they have a verified email address */
    return !!this.getShortname() && !!this.getPreferredName();
  }
}
