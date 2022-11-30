import { SYSTEM_ACCOUNT_SHORTNAME } from "@hashintel/hash-shared/environment";
import { OrgModel, UserModel } from "..";
import { GraphApi } from "../../graph";
import { systemAccountId } from "../util";

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
