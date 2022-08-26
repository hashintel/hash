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
export default class extends EntityModel {}
