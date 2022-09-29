import { WORKSPACE_ACCOUNT_SHORTNAME } from "@hashintel/hash-backend-utils/system";
import { OrgModel, UserModel } from "..";
import { GraphApi } from "../../graph";
import { workspaceAccountId } from "../util";

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
    params.ownerId === workspaceAccountId
      ? WORKSPACE_ACCOUNT_SHORTNAME
      : (
          (await UserModel.getUserById(graphApi, {
            entityId: params.ownerId,
          }).catch(() => undefined)) ??
          (await OrgModel.getOrgById(graphApi, {
            entityId: params.ownerId,
          }).catch(() => undefined))
        )?.getShortname();

  if (!namespace) {
    throw new Error(`failed to get namespace for owner: ${params.ownerId}`);
  }

  return namespace;
};
