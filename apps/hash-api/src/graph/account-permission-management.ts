import type {
  OwnedById,
  UntaggedActorId,
  UntaggedTeamId,
} from "@blockprotocol/type-system";
import type {
  InsertAccountGroupIdParams,
  InsertAccountIdParams,
  WebOwnerSubject,
} from "@local/hash-graph-client";

import type { ImpureGraphFunction } from "./context-types";

export const addAccountGroupMember: ImpureGraphFunction<
  { accountId: UntaggedActorId; accountGroupId: UntaggedTeamId },
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
  { accountId: UntaggedActorId; accountGroupId: UntaggedTeamId },
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
  Promise<UntaggedActorId>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .createAccount(actorId, params)
    .then(({ data }) => data as UntaggedActorId);

export const createAccountGroup: ImpureGraphFunction<
  InsertAccountGroupIdParams,
  Promise<UntaggedTeamId>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .createAccountGroup(actorId, params)
    .then(({ data }) => data as UntaggedTeamId);

export const createWeb: ImpureGraphFunction<
  { ownedById: OwnedById; owner: WebOwnerSubject },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.createWeb(actorId, params);
};
