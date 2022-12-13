import { systemUserShortname } from "@hashintel/hash-shared/environment";
import { entityIdFromOwnedByIdAndEntityUuid } from "@hashintel/hash-subgraph";
import { OrgModel, UserModel } from "../../../model";
import { GraphApi } from "../..";
import { systemUserAccountId } from "../../system-user";

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
    params.ownerId === systemUserAccountId
      ? systemUserShortname
      : (
          (await UserModel.getUserById(graphApi, {
            entityId: entityIdFromOwnedByIdAndEntityUuid(
              systemUserAccountId,
              params.ownerId,
            ),
          }).catch(() => undefined)) ??
          (await OrgModel.getOrgById(graphApi, {
            entityId: entityIdFromOwnedByIdAndEntityUuid(
              systemUserAccountId,
              params.ownerId,
            ),
          }).catch(() => undefined))
        )?.getShortname();

  if (!namespace) {
    throw new Error(`failed to get namespace for owner: ${params.ownerId}`);
  }

  return namespace;
};
