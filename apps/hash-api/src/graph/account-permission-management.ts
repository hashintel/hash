import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  AiId,
  MachineId,
  UserId,
  WebId,
} from "@blockprotocol/type-system";

import type { ImpureGraphFunction } from "./context-types";

export const addActorGroupMember: ImpureGraphFunction<
  { actorId: ActorEntityUuid; actorGroupId: ActorGroupEntityUuid },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.assignActorGroupRole(
    actorId,
    params.actorGroupId,
    "member",
    params.actorId,
  );

  return true;
};

export const removeActorGroupMember: ImpureGraphFunction<
  { actorId: ActorEntityUuid; actorGroupId: ActorGroupEntityUuid },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.unassignActorGroupRole(
    actorId,
    params.actorGroupId,
    "member",
    params.actorId,
  );

  return true;
};

export const createUserActor: ImpureGraphFunction<
  {
    shortname?: string;
    registrationComplete: boolean;
  },
  Promise<{ userId: UserId; machineId: MachineId }>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.createUserActor(actorId, params).then(({ data }) => ({
    userId: data.userId as UserId,
    machineId: data.machineId as MachineId,
  }));

export const createAiActor: ImpureGraphFunction<
  {
    identifier: string;
  },
  Promise<AiId>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.createAiActor(actorId, params).then(({ data }) => data as AiId);

export const findWeb: ImpureGraphFunction<
  {
    webId: WebId;
  },
  Promise<{ webId: WebId; machineId: MachineId; shortname?: string } | null>
> = async ({ graphApi }, { actorId }, params) => {
  const { data } = await graphApi.findWeb(actorId, params.webId);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!data) {
    throw new Error(`No web found for id "${params.webId}"`);
  }
  return {
    webId: params.webId,
    machineId: data.machineId as MachineId,
    shortname: data.shortname,
  };
};

export const findWebByShortname: ImpureGraphFunction<
  {
    shortname: string;
  },
  Promise<{ webId: WebId; machineId: MachineId; shortname: string }>
> = async ({ graphApi }, { actorId }, params) => {
  const { data } = await graphApi.findWebByShortname(actorId, params.shortname);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!data) {
    throw new Error(`No web found for the shortname "${params.shortname}"`);
  }
  return {
    webId: data.webId as WebId,
    machineId: data.machineId as MachineId,
    shortname: params.shortname,
  };
};

export const createOrgWeb: ImpureGraphFunction<
  {
    shortname: string;
  },
  Promise<{ webId: WebId; machineId: MachineId }>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.createOrgWeb(actorId, params).then(({ data }) => ({
    webId: data.webId as WebId,
    machineId: data.machineId as MachineId,
  }));
