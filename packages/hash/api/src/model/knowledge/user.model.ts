import { GraphApi } from "@hashintel/hash-graph-client";
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
import { workspaceAccountId } from "../util";

type QualifiedEmail = { address: string; verified: boolean; primary: boolean };

type UserModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "ownedById"
> & {
  emails: string[];
  kratosIdentityId: string;
};

/**
 * @class {@link UserModel}
 */
export default class extends EntityModel {
  static fromEntityModel(entity: EntityModel): UserModel {
    if (
      entity.entityTypeModel.schema.$id !==
      WORKSPACE_TYPES.entityType.user.schema.$id
    ) {
      throw new Error(
        `Entity with id ${entity.entityId} is not a workspace user`,
      );
    }

    return new UserModel(entity);
  }

  /**
   * Get a workspace user entity by its entity id.
   *
   * @param params.entityId - the entity id of the user
   */
  static async getUserById(
    graphApi: GraphApi,
    params: { entityId: string },
  ): Promise<UserModel> {
    const entity = await EntityModel.getLatest(graphApi, {
      entityId: params.entityId,
    });

    return UserModel.fromEntityModel(entity);
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
    const userEntities = await EntityModel.getByQuery(graphApi, {
      all: [
        { eq: [{ path: ["version"] }, { literal: "latest" }] },
        {
          eq: [
            { path: ["type", "versionedUri"] },
            { literal: WORKSPACE_TYPES.entityType.user.schema.$id },
          ],
        },
      ],
    });

    return (
      userEntities
        .map(UserModel.fromEntityModel)
        .find((user) => user.getShortname() === params.shortname) ?? null
    );
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
    const userEntities = await EntityModel.getByQuery(graphApi, {
      all: [
        { eq: [{ path: ["version"] }, { literal: "latest" }] },
        {
          eq: [
            { path: ["type", "versionedUri"] },
            { literal: WORKSPACE_TYPES.entityType.user.schema.$id },
          ],
        },
      ],
    });

    return (
      userEntities
        .map(UserModel.fromEntityModel)
        .find(
          (user) => user.getKratosIdentityId() === params.kratosIdentityId,
        ) ?? null
    );
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

    const entity = await EntityModel.create(graphApi, {
      ownedById: workspaceAccountId,
      properties,
      entityTypeModel,
      entityId: userAccountId,
    });

    return UserModel.fromEntityModel(entity);
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
   * @param params.updatedShortname - the new shortname to assign to the User
   */
  async updateShortname(
    graphApi: GraphApi,
    params: { updatedShortname: string },
  ): Promise<UserModel> {
    const { updatedShortname } = params;

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
    }).then((updatedEntity) => new UserModel(updatedEntity));

    await this.updateKratosIdentityTraits({
      shortname: updatedShortname,
    }).catch(async (error) => {
      // If an error occurred updating the entity, set the property to have the previous shortname
      await this.updateProperty(graphApi, {
        propertyTypeBaseUri: WORKSPACE_TYPES.propertyType.shortName.baseUri,
        value: previousShortname,
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
   * @param params.updatedPreferredName - the new preferred name to assign to the User
   */
  async updatePreferredName(
    graphApi: GraphApi,
    params: { updatedPreferredName: string },
  ) {
    const { updatedPreferredName } = params;

    if (UserModel.preferredNameIsInvalid(updatedPreferredName)) {
      throw new Error(`Preferred name "${updatedPreferredName}" is invalid.`);
    }

    const updatedEntity = await this.updateProperty(graphApi, {
      propertyTypeBaseUri: WORKSPACE_TYPES.propertyType.preferredName.baseUri,
      value: updatedPreferredName,
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
    _params: { updatedInfo: any },
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
      linkTypeModel: WORKSPACE_TYPES.linkType.hasMembership,
      targetEntityModel: orgMembership,
      ownedById: workspaceAccountId,
    });
  }

  async getOrgMemberships(graphApi: GraphApi): Promise<OrgMembershipModel[]> {
    const { data: outgoingOrgMembershipLinkRootedSubgraphs } =
      await graphApi.getLinksByQuery({
        query: {
          all: [
            {
              eq: [{ path: ["source", "id"] }, { literal: this.entityId }],
            },
            {
              eq: [
                { path: ["type", "versionedUri"] },
                {
                  literal: WORKSPACE_TYPES.linkType.hasMembership.schema.$id,
                },
              ],
            },
          ],
        },
        dataTypeQueryDepth: 0,
        propertyTypeQueryDepth: 0,
        linkTypeQueryDepth: 0,
        entityTypeQueryDepth: 0,
        linkTargetEntityQueryDepth: 0,
        linkQueryDepth: 0,
      });

    return await Promise.all(
      outgoingOrgMembershipLinkRootedSubgraphs.map(async ({ link }) => {
        const orgMembership = await OrgMembershipModel.getOrgMembershipById(
          graphApi,
          {
            entityId: link.inner.targetEntityId,
          },
        );

        if (!orgMembership) {
          throw new Error("Critical: could not find target of link");
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
