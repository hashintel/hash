import { EntityId, PropertyObject } from "@hashintel/hash-subgraph";
import { GraphApi } from "../../graph";
import {
  OrgModel,
  EntityModel,
  EntityModelCreateParams,
  AccountFields,
} from "..";
import { SYSTEM_TYPES } from "../../graph/system-types";
import { EntityTypeMismatchError } from "../../lib/error";
import { systemUserAccountId } from "../../graph/system-user";

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
  "properties" | "entityType" | "ownedById"
> & {
  shortname: string;
  name: string;
  providedInfo?: OrgProvidedInfo;
  orgAccountId?: string;
};

/**
 * @class {@link OrgModel}
 */
export default class extends EntityModel {
  /**
   * Create a system organization entity.
   *
   * @param params.shortname - the shortname of the organization
   * @param params.name - the name of the organization
   * @param params.providedInfo - optional metadata about the organization
   *
   * @see {@link EntityModel.create} for the remaining params
   */
  static async createOrg(graphApi: GraphApi, params: OrgModelCreateParams) {
    const { shortname, name, providedInfo, actorId } = params;

    if (AccountFields.shortnameIsInvalid(shortname)) {
      throw new Error(`The shortname "${shortname}" is invalid`);
    }

    if (
      AccountFields.shortnameIsRestricted(shortname) ||
      (await AccountFields.shortnameIsTaken(graphApi, { shortname }))
    ) {
      throw new Error(
        `An account with shortname "${shortname}" already exists.`,
      );
    }

    const orgAccountId =
      params.orgAccountId ?? (await graphApi.createAccountId()).data;

    const properties: PropertyObject = {
      [SYSTEM_TYPES.propertyType.shortName.metadata.editionId.baseId]:
        shortname,
      [SYSTEM_TYPES.propertyType.orgName.metadata.editionId.baseId]: name,
      ...(providedInfo
        ? {
            [SYSTEM_TYPES.propertyType.orgProvidedInfo.metadata.editionId
              .baseId]: {
              [SYSTEM_TYPES.propertyType.orgSize.metadata.editionId.baseId]:
                providedInfo.orgSize,
            },
          }
        : {}),
    };

    const entityType = SYSTEM_TYPES.entityType.org;

    const entity = await EntityModel.create(graphApi, {
      ownedById: systemUserAccountId,
      properties,
      entityType,
      entityUuid: orgAccountId,
      actorId,
    });

    return OrgModel.fromEntityModel(entity);
  }

  static fromEntityModel(entityModel: EntityModel): OrgModel {
    if (
      entityModel.entityType.schema.$id !==
      SYSTEM_TYPES.entityType.org.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        entityModel.getBaseId(),
        SYSTEM_TYPES.entityType.org.schema.$id,
        entityModel.entityType.schema.$id,
      );
    }

    return new OrgModel(entityModel);
  }

  /**
   * Get a system organization entity by its entity id.
   *
   * @param params.entityId - the entity id of the organization
   */
  static async getOrgById(
    graphApi: GraphApi,
    params: { entityId: EntityId },
  ): Promise<OrgModel> {
    const entity = await EntityModel.getLatest(graphApi, {
      entityId: params.entityId,
    });

    return OrgModel.fromEntityModel(entity);
  }

  /**
   * Get a system organization entity by its shortname.
   *
   * @param params.shortname - the shortname of the organization
   */
  static async getOrgByShortname(
    graphApi: GraphApi,
    params: { shortname: string },
  ): Promise<OrgModel | null> {
    /** @todo: use upcoming Graph API method to filter entities in the datastore */
    const orgEntities = await EntityModel.getByQuery(graphApi, {
      all: [
        { equal: [{ path: ["version"] }, { parameter: "latest" }] },
        {
          equal: [
            { path: ["type", "versionedUri"] },
            { parameter: SYSTEM_TYPES.entityType.org.schema.$id },
          ],
        },
      ],
    });

    return (
      orgEntities
        .map((orgEntity) => OrgModel.fromEntityModel(orgEntity))
        .find((org) => org.getShortname() === params.shortname) ?? null
    );
  }

  getShortname(): string {
    return (this.getProperties() as any)[
      SYSTEM_TYPES.propertyType.shortName.metadata.editionId.baseId
    ];
  }

  /**
   * Update the shortname of an Organization
   *
   * @param params.updatedShortname - the new shortname to assign to the Organization
   * @param params.actorId - the id of the account updating the shortname
   */
  async updateShortname(
    graphApi: GraphApi,
    params: { updatedShortname: string; actorId: string },
  ): Promise<OrgModel> {
    const { updatedShortname, actorId } = params;

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
        `An account with shortname "${updatedShortname}" already exists.`,
      );
    }

    return await this.updateProperty(graphApi, {
      propertyTypeBaseUri:
        SYSTEM_TYPES.propertyType.shortName.metadata.editionId.baseId,
      value: updatedShortname,
      actorId,
    }).then((updatedEntity) => OrgModel.fromEntityModel(updatedEntity));
  }

  getOrgName(): string {
    return (this.getProperties() as any)[
      SYSTEM_TYPES.propertyType.orgName.metadata.editionId.baseId
    ];
  }

  static orgNameIsInvalid(preferredName: string) {
    return preferredName === "";
  }

  /**
   * Update the name of an Organization
   *
   * @param params.updatedOrgName - the new name to assign to the Organization
   * @param params.actorId - the id of the account updating the name
   */
  async updateOrgName(
    graphApi: GraphApi,
    params: { updatedOrgName: string; actorId: string },
  ) {
    const { updatedOrgName, actorId } = params;

    if (OrgModel.orgNameIsInvalid(updatedOrgName)) {
      throw new Error(`Organization name "${updatedOrgName}" is invalid.`);
    }

    const updatedEntity = await this.updateProperty(graphApi, {
      propertyTypeBaseUri:
        SYSTEM_TYPES.propertyType.orgName.metadata.editionId.baseId,
      value: updatedOrgName,
      actorId,
    });

    return OrgModel.fromEntityModel(updatedEntity);
  }
}
