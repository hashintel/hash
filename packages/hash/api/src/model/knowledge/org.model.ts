import { GraphApi } from "../../graph";
import {
  OrgModel,
  EntityModel,
  EntityModelCreateParams,
  AccountFields,
  EntityTypeModel,
} from "..";
import { workspaceAccountId } from "../util";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";

/**
 * @todo revisit organization size provided info. These constant strings could
 *   be replaced by ranges for example.
 *   https://app.asana.com/0/0/1202900021005257/f
 */
export enum OrgSize {
  ElevenToFifty = "ELEVEN_TO_FIFTY",
  FiftyOneToTwoHundredAndFifty = "FIFTY_ONE_TO_TWO_HUNDRED_AND_FIFTY",
  OneToTen = "ONE_TO_TEN",
  TwoHundredAndFiftyPlus = "TWO_HUNDRED_AND_FIFTY_PLUS",
}

export type OrgProvidedInfo = {
  orgSize: OrgSize;
};

export type OrgModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "accountId"
> & {
  shortname: string;
  name: string;
  providedInfo?: OrgProvidedInfo;
};

/**
 * @class {@link OrgModel}
 */
export default class extends EntityModel {
  /**
   * Create a workspace organization entity.
   *
   * @param params.shortname - the shortname of the organization
   * @param params.name - the name of the organization
   * @param params.providedInfo - optional metadata about the organization
   */
  static async createOrg(graphApi: GraphApi, params: OrgModelCreateParams) {
    const { shortname, name, providedInfo } = params;

    const { data: orgAccountId } = await graphApi.createAccountId();

    const properties: object = {
      [WORKSPACE_TYPES.propertyType.accountId.baseUri]: orgAccountId,
      [WORKSPACE_TYPES.propertyType.shortName.baseUri]: shortname,
      [WORKSPACE_TYPES.propertyType.orgName.baseUri]: name,
      [WORKSPACE_TYPES.propertyType.orgProvidedInfo.baseUri]: providedInfo
        ? {
            [WORKSPACE_TYPES.propertyType.orgSize.baseUri]:
              providedInfo.orgSize,
          }
        : undefined,
    };

    const entityTypeModel = await OrgModel.getOrgEntityType(graphApi);

    const userEntityAccountId = workspaceAccountId;

    const { entityId, version } = await EntityModel.create(graphApi, {
      accountId: workspaceAccountId,
      properties,
      entityTypeModel,
    });

    return new OrgModel({
      accountId: userEntityAccountId,
      entityId,
      version,
      entityTypeModel,
      properties,
    });
  }

  /**
   * Get the system Organization entity type.
   */
  static async getOrgEntityType(graphApi: GraphApi) {
    const versionedUri = WORKSPACE_TYPES.entityType.org.schema.$id;

    return await EntityTypeModel.get(graphApi, {
      versionedUri,
    });
  }

  /**
   * Get a workspace organization entity by its shortname.
   *
   * @param params.shortname - the shortname of the organization
   */
  static async getOrgByShortname(
    graphApi: GraphApi,
    params: { shortname: string },
  ): Promise<OrgModel | null> {
    const versionedUri = WORKSPACE_TYPES.entityType.org.schema.$id;

    /** @todo: use upcoming Graph API method to filter entities in the datastore */
    const allEntities = await EntityModel.getAllLatest(graphApi, {
      accountId: workspaceAccountId,
    });

    const matchingOrg = allEntities
      .filter(
        ({ entityTypeModel }) => entityTypeModel.schema.$id === versionedUri,
      )
      .map((entityModel) => new OrgModel(entityModel))
      .find((org) => org.getShortname() === params.shortname);

    return matchingOrg ?? null;
  }

  getAccountId(): string {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.accountId.baseUri
    ];
  }

  getShortname(): string {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.shortName.baseUri
    ];
  }

  /**
   * Update the shortname of an Organization
   *
   * @param params.updatedByAccountId - the account id of the user requesting the updating
   * @param params.updatedShortname - the new shortname to assign to the Organization
   */
  async updateShortname(
    graphApi: GraphApi,
    params: { updatedByAccountId: string; updatedShortname: string },
  ): Promise<OrgModel> {
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

    return await this.updateProperty(graphApi, {
      propertyTypeBaseUri: WORKSPACE_TYPES.propertyType.shortName.baseUri,
      value: updatedShortname,
      updatedByAccountId,
    }).then((updatedEntity) => new OrgModel(updatedEntity));
  }

  getOrgName(): string {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.orgName.baseUri
    ];
  }

  static orgNameIsInvalid(preferredName: string) {
    return preferredName === "";
  }

  /**
   * Update the name of an Organization
   *
   * @param params.updatedByAccountId - the account id of the user requesting the updating
   * @param params.updatedOrgName - the new name to assign to the Organization
   */
  async updateOrgName(
    graphApi: GraphApi,
    params: { updatedByAccountId: string; updatedOrgName: string },
  ) {
    const { updatedByAccountId, updatedOrgName } = params;

    if (OrgModel.orgNameIsInvalid(updatedOrgName)) {
      throw new Error(`Organization name "${updatedOrgName}" is invalid.`);
    }

    const updatedEntity = await this.updateProperty(graphApi, {
      propertyTypeBaseUri: WORKSPACE_TYPES.propertyType.orgName.baseUri,
      value: updatedOrgName,
      updatedByAccountId,
    });

    return new OrgModel(updatedEntity);
  }
}
