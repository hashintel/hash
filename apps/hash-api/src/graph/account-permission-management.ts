import {
  InsertAccountGroupIdParams,
  InsertAccountIdParams,
  WebOwnerSubject,
} from "@local/hash-graph-client";
import { AccountGroupId, AccountId, OwnedById } from "@local/hash-subgraph";

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

export const createAccount: ImpureGraphFunction<
  InsertAccountIdParams,
  Promise<AccountId>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.createAccount(actorId, params).then(({ data }) => data as AccountId);

export const createAccountGroup: ImpureGraphFunction<
  InsertAccountGroupIdParams,
  Promise<AccountGroupId>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .createAccountGroup(actorId, params)
    .then(({ data }) => data as AccountGroupId);

export const createWeb: ImpureGraphFunction<
  { ownedById: OwnedById; owner: WebOwnerSubject },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.createWeb(actorId, params);
};
