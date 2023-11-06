import { AccountGroupId, AccountId } from "@local/hash-subgraph";

import { ImpureGraphFunction } from "./context-types";

export const addAccountGroupMember: ImpureGraphFunction<
  { accountId: AccountId; accountGroupId: AccountGroupId },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.addAccountGroupMember(
    actorId,
    params.accountGroupId,
    params.accountId,
  );

  return true;
};

export const removeAccountGroupMember: ImpureGraphFunction<
  { accountId: AccountId; accountGroupId: AccountGroupId },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.removeAccountGroupMember(
    actorId,
    params.accountGroupId,
    params.accountId,
  );

  return true;
};
