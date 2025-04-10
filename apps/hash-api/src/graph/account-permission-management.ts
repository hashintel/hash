import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  WebId,
} from "@blockprotocol/type-system";
import type {
  InsertAccountGroupIdParams,
  InsertAccountIdParams,
  WebOwnerSubject,
} from "@local/hash-graph-client";

import type { ImpureGraphFunction } from "./context-types";

export const addAccountGroupMember: ImpureGraphFunction<
  { accountId: ActorEntityUuid; accountGroupId: ActorGroupEntityUuid },
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
  { accountId: ActorEntityUuid; accountGroupId: ActorGroupEntityUuid },
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
  Promise<ActorGroupEntityUuid>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .createAccountGroup(actorId, params)
    .then(({ data }) => data as ActorGroupEntityUuid);

export const createWeb: ImpureGraphFunction<
  { webId?: WebId; owner: WebOwnerSubject },
  Promise<WebId>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.createWeb(actorId, params).then(({ data }) => data as WebId);
