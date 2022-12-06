import { SYSTEM_ACCOUNT_SHORTNAME } from "@hashintel/hash-shared/environment";
import { OrgModel, UserModel } from "..";
import { GraphApi } from "../../graph";
import { systemOrgAccountId } from "../../graph/system-org";

/**
 * Get the namespace of an account owner by its id
 *
 * @param params.ownerId - the id of the owner
 */
export const getNamespaceOfAccountOwner = async (
  graphApi: GraphApi,
  params: { ownerId: string },
) => {
  const namespace =
    params.ownerId === systemOrgAccountId
      ? SYSTEM_ACCOUNT_SHORTNAME
      : (
          (await UserModel.getUserById(graphApi, {
            entityId: `${systemOrgAccountId}%${params.ownerId}`,
          }).catch(() => undefined)) ??
          (await OrgModel.getOrgById(graphApi, {
            entityId: `${systemOrgAccountId}%${params.ownerId}`,
          }).catch(() => undefined))
        )?.getShortname();

  if (!namespace) {
    throw new Error(`failed to get namespace for owner: ${params.ownerId}`);
  }

  return namespace;
};
