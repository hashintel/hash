import type {
  ActorEntityUuid,
  ActorGroupId,
  OwnedById,
} from "@blockprotocol/type-system";
import type {
  InsertAccountGroupIdParams,
  InsertAccountIdParams,
  WebOwnerSubject,
} from "@local/hash-graph-client";

import type { ImpureGraphFunction } from "./context-types";

export const addAccountGroupMember: ImpureGraphFunction<
  { accountId: ActorEntityUuid; accountGroupId: ActorGroupId },
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
  { accountId: ActorEntityUuid; accountGroupId: ActorGroupId },
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
  Promise<ActorEntityUuid>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .createAccount(actorId, params)
    .then(({ data }) => data.id as ActorEntityUuid);

export const createAccountGroup: ImpureGraphFunction<
  InsertAccountGroupIdParams,
  Promise<ActorGroupId>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .createAccountGroup(actorId, params)
    .then(({ data }) => data as ActorGroupId);

export const createWeb: ImpureGraphFunction<
  { ownedById: OwnedById; owner: WebOwnerSubject },
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.createWeb(actorId, params);
};
