import { GraphApi } from "../../graph";
import {
  OrgModel,
  EntityModel,
  EntityModelCreateParams,
  AccountUtil,
} from "../index";
import { generateWorkspaceEntityTypeSchema, workspaceAccountId } from "../util";

export type OrgModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel" | "accountId"
> & {
  shortname: string;
};

// Generate the schema for the org entity type
export const orgEntityType = generateWorkspaceEntityTypeSchema({
  title: "User",
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
  ],
});

const orgEntityTypeVersionedUri = orgEntityType.$id;

/**
 * @class {@link OrgModel}
 */
export default class extends EntityModel {
  /**
   * Get a workspace organization entity by their shortname.
   *
   * @param params.shortname - the shortname of the organization
   */
  static async getUserByShortname(
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
      .find((user) => user.getShortname() === params.shortname);

    return matchingOrg ?? null;
  }

  getShortname(): string | undefined {
    return (this.properties as any)[AccountUtil.shortnameBaseUri];
  }
}
