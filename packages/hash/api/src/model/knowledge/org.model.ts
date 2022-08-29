import { GraphApi } from "../../graph";
import {
  OrgModel,
  EntityModel,
  EntityModelCreateParams,
  AccountUtil,
  EntityTypeModel,
} from "..";
import {
  generateSchemaBaseUri,
  generateWorkspaceEntityTypeSchema,
  generateWorkspacePropertyTypeSchema,
  workspaceAccountId,
  workspaceTypesNamespaceUri,
} from "../util";

// Generate the schema for the organization name property type
export const orgNamePropertyType = generateWorkspacePropertyTypeSchema({
  title: "Organization Name",
  possibleValues: [{ primitiveDataType: "Text" }],
});

export const orgNamedBaseUri = generateSchemaBaseUri({
  namespaceUri: workspaceTypesNamespaceUri,
  kind: "propertyType",
  title: orgNamePropertyType.title,
});

// Generate the schema for the org size property type
export const orgSizePropertyType = generateWorkspacePropertyTypeSchema({
  title: "Organization Size",
  possibleValues: [{ primitiveDataType: "Text" }],
});

export const orgSizeBaseUri = generateSchemaBaseUri({
  namespaceUri: workspaceTypesNamespaceUri,
  kind: "propertyType",
  title: orgSizePropertyType.title,
});

// Generate the schema for the org provided info property type
export const orgProvidedInfoPropertyType = generateWorkspacePropertyTypeSchema({
  title: "Organization Provided Info",
  possibleValues: [
    {
      propertyTypeObject: {
        [orgSizeBaseUri]: { $ref: orgSizePropertyType.$id },
      },
    },
  ],
});

export const orgProvidedInfoBaseUri = generateSchemaBaseUri({
  namespaceUri: workspaceTypesNamespaceUri,
  kind: "propertyType",
  title: orgProvidedInfoPropertyType.title,
});

export const OrgPropertyTypes = [
  orgNamePropertyType,
  orgSizePropertyType,
  orgProvidedInfoPropertyType,
] as const;

// Generate the schema for the org entity type
export const orgEntityType = generateWorkspaceEntityTypeSchema({
  title: "Organization",
  properties: [
    {
      baseUri: AccountUtil.shortnameBaseUri,
      versionedUri: AccountUtil.shortnamePropertyType.$id,
      required: true,
    },
    {
      baseUri: AccountUtil.accountIdBaseUri,
      versionedUri: AccountUtil.accountIdPropertyType.$id,
      required: true,
    },
    {
      baseUri: orgNamedBaseUri,
      versionedUri: orgNamePropertyType.$id,
      required: true,
    },
    {
      baseUri: orgProvidedInfoBaseUri,
      versionedUri: orgProvidedInfoPropertyType.$id,
      required: false,
    },
  ],
});

const orgEntityTypeVersionedUri = orgEntityType.$id;

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
  static async createOrg(graphApi: GraphApi, params: OrgModelCreateParams) {
    const { shortname, name, providedInfo } = params;

    const { data: orgAccountId } = await graphApi.createAccountId();

    const properties: object = {
      [AccountUtil.accountIdBaseUri]: orgAccountId,
      [AccountUtil.shortnameBaseUri]: shortname,
      [orgNamedBaseUri]: name,
      [orgProvidedInfoBaseUri]: providedInfo
        ? {
            [orgSizeBaseUri]: providedInfo.orgSize,
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

  static async getOrgEntityType(graphApi: GraphApi) {
    return await EntityTypeModel.get(graphApi, {
      versionedUri: orgEntityTypeVersionedUri,
    });
  }

  /**
   * Get a workspace organization entity by their shortname.
   *
   * @param params.shortname - the shortname of the organization
   */
  static async getOrgByShortname(
    graphApi: GraphApi,
    params: { shortname: string },
  ): Promise<OrgModel | null> {
    /** @todo: use upcoming Graph API method to filter entities in the datastore */
    const allEntities = await EntityModel.getAllLatest(graphApi, {
      accountId: workspaceAccountId,
    });

    const matchingOrg = allEntities
      .filter(
        ({ entityTypeModel }) =>
          entityTypeModel.schema.$id === orgEntityTypeVersionedUri,
      )
      .map((entityModel) => new OrgModel(entityModel))
      .find((org) => org.getShortname() === params.shortname);

    return matchingOrg ?? null;
  }

  getShortname(): string | undefined {
    return (this.properties as any)[AccountUtil.shortnameBaseUri];
  }
}
