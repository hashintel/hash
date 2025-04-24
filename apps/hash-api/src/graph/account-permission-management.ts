import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  AiId,
  MachineId,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";

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

export const getWeb: ImpureGraphFunction<
  {
    webId: WebId;
  },
  Promise<{ webId: WebId; machineId: MachineId; shortname?: string }>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .getWeb(actorId, params.webId)
    .then(({ data }) => ({
      webId: params.webId,
      machineId: data.machineId as MachineId,
      shortname: data.shortname,
    }))
    .catch((error) => {
      if (error.response?.status === 404) {
        throw new NotFoundError(
          `No web with id ${params.webId} found in the graph.`,
        );
      } else {
        throw error;
      }
    });

export const findWebByShortname: ImpureGraphFunction<
  {
    shortname: string;
  },
  Promise<{ webId: WebId; machineId: MachineId; shortname: string }>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .getWebByShortname(actorId, params.shortname)
    .then(({ data }) => ({
      webId: data.webId as WebId,
      machineId: data.machineId as MachineId,
      shortname: params.shortname,
    }))
    .catch((error) => {
      if (error.response?.status === 404) {
        throw new NotFoundError(
          `No web with shortname ${params.shortname} found in the graph.`,
        );
      } else {
        throw error;
      }
    });

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
