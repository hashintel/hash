import { WebOwnerSubject } from "@local/hash-graph-client";
import { AccountGroupId, AccountId, OwnedById } from "@local/hash-subgraph";
import { Either } from "effect";

import { ImpureGraphFunction } from "./context-types";

export const addAccountGroupMember: ImpureGraphFunction<
  { accountId: AccountId; accountGroupId: AccountGroupId },
  Promise<boolean>,
  false,
  true
> = async ({ rpcClient }, { actorId }, params) => {
  await rpcClient.accounts.addAccountGroupMember(actorId, params);

  return true;
};

export const removeAccountGroupMember: ImpureGraphFunction<
  { accountId: AccountId; accountGroupId: AccountGroupId },
  Promise<boolean>,
  false,
  true
> = async ({ rpcClient }, { actorId }, params) => {
  await rpcClient.accounts.removeAccountGroupMember(actorId, params);

  return true;
};

export const createAccount: ImpureGraphFunction<
  {},
  Promise<AccountId>,
  false,
  true
> = async ({ rpcClient }, { actorId }, _) =>
  rpcClient.accounts
    .createAccount(actorId, null)
    .then((data) => Either.getOrThrow(data) as AccountId);

export const createAccountGroup: ImpureGraphFunction<
  {},
  Promise<AccountGroupId>,
  false,
  true
> = async ({ rpcClient }, { actorId }, _) =>
  rpcClient.accounts
    .createAccountGroup(actorId, null)
    .then((data) => Either.getOrThrow(data) as AccountGroupId);

export const createWeb: ImpureGraphFunction<
  { ownedById: OwnedById; owner: WebOwnerSubject },
  Promise<void>,
  false,
  true
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.createWeb(actorId, params);
};
