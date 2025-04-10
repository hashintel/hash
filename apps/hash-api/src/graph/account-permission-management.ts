import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  ActorGroupId,
  ActorType,
  TeamId,
  WebId,
} from "@blockprotocol/type-system";

import type { ImpureGraphFunction } from "./context-types";

export const addAccountGroupMember: ImpureGraphFunction<
  { accountId: ActorEntityUuid; accountGroupId: ActorGroupEntityUuid },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.assignAccountGroupRole(
    actorId,
    params.accountGroupId,
    "member",
    params.accountId,
  );

  return true;
};

export const removeAccountGroupMember: ImpureGraphFunction<
  { accountId: ActorEntityUuid; accountGroupId: ActorGroupEntityUuid },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.unassignAccountGroupRole(
    actorId,
    params.accountGroupId,
    "member",
    params.accountId,
  );

  return true;
};

export const createAccount: ImpureGraphFunction<
  {
    accountId?: ActorEntityUuid;
    accountType: ActorType;
  },
  Promise<ActorEntityUuid>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .createAccount(actorId, params)
    .then(({ data }) => data.id as ActorEntityUuid);

export const createAccountGroup: ImpureGraphFunction<
  {
    parent: ActorGroupId;
    teamId?: TeamId;
  },
  Promise<ActorGroupEntityUuid>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .createAccountGroup(actorId, params)
    .then(({ data }) => data as ActorGroupEntityUuid);

export const createWeb: ImpureGraphFunction<
  { webId?: WebId; administrator: ActorEntityUuid },
  Promise<WebId>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.createWeb(actorId, params).then(({ data }) => data as WebId);
