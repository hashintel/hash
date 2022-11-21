import { SYSTEM_ACCOUNT_SHORTNAME } from "@hashintel/hash-backend-utils/system";
import { EntityTypeWithMetadata } from "@hashintel/hash-subgraph";
import { OrgModel, UserModel } from "..";
import { GraphApi } from "../../graph";
import { systemAccountId } from "../util";

/**
 * @todo: import this directly from `@hashintel/hash-subgraph` once it is exported
 * @see  https://app.asana.com/0/1202805690238892/1203409252899196/f
 */
export type OntologyElementMetadata = EntityTypeWithMetadata["metadata"];

/**
 * Get the namespace of an account owner by its id
 *
 * @param params.ownerId - the id of the owner
 */
export const getNamespaceOfAccountOwner = async (
  graphApi: GraphApi,
  params: { ownerId: string },
) => {
  /** @todo - get rid of this hack for the root account */
  const namespace =
    params.ownerId === systemAccountId
      ? SYSTEM_ACCOUNT_SHORTNAME
      : (
          (await UserModel.getUserById(graphApi, {
            entityId: `${systemAccountId}%${params.ownerId}`,
          }).catch(() => undefined)) ??
          (await OrgModel.getOrgById(graphApi, {
            entityId: `${systemAccountId}%${params.ownerId}`,
          }).catch(() => undefined))
        )?.getShortname();

  if (!namespace) {
    throw new Error(`failed to get namespace for owner: ${params.ownerId}`);
  }

  return namespace;
};
