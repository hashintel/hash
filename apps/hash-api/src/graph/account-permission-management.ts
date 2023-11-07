import { AccountGroupId, AccountId, OwnedById } from "@local/hash-subgraph";

import { ImpureGraphFunction } from "./context-types";
import { WebOwnerSubject } from "@local/hash-graph-client";

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

export const createAccount: ImpureGraphFunction<
  {},
  Promise<AccountId>
> = async ({ graphApi }, { actorId }, _) =>
  graphApi.createAccount(actorId).then(({ data }) => data as AccountId);

export const createAccountGroup: ImpureGraphFunction<
  {},
  Promise<AccountGroupId>
> = async ({ graphApi }, { actorId }, _) =>
  graphApi
    .createAccountGroup(actorId)
    .then(({ data }) => data as AccountGroupId);

export const createWeb: ImpureGraphFunction<
  { ownedById: OwnedById; owner: WebOwnerSubject },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.createWeb(actorId, params);
};
