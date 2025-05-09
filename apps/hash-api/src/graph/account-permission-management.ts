import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  AiId,
  MachineId,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import type {
  RoleAssignmentStatus,
  RoleUnassignmentStatus,
} from "@local/hash-graph-client";

import type { ImpureGraphFunction } from "./context-types";

export const getActorGroupMembers: ImpureGraphFunction<
  { actorGroupId: ActorGroupEntityUuid },
  Promise<ActorEntityUuid[]>
> = async ({ graphApi }, authentication, params) =>
  graphApi
    .getActorGroupRoleAssignments(
      authentication.actorId,
      params.actorGroupId,
      "member",
    )
    .then(({ data }) => data as ActorEntityUuid[]);

export const addActorGroupMember: ImpureGraphFunction<
  { actorId: ActorEntityUuid; actorGroupId: ActorGroupEntityUuid },
  Promise<RoleAssignmentStatus>
> = async ({ graphApi }, authentication, params) =>
  graphApi
    .assignActorGroupRole(
      authentication.actorId,
      params.actorGroupId,
      "member",
      params.actorId,
    )
    .then(({ data }) => data);

export const isActorGroupMember: ImpureGraphFunction<
  { actorId: ActorEntityUuid; actorGroupId: ActorGroupEntityUuid },
  Promise<boolean>
> = async ({ graphApi }, authentication, params) =>
  graphApi
    .hasActorGroupRole(
      authentication.actorId,
      params.actorGroupId,
      "member",
      params.actorId,
    )
    .then(({ data }) => data);

export const removeActorGroupMember: ImpureGraphFunction<
  { actorId: ActorEntityUuid; actorGroupId: ActorGroupEntityUuid },
  Promise<RoleUnassignmentStatus>
> = async ({ graphApi }, authentication, params) =>
  graphApi
    .unassignActorGroupRole(
      authentication.actorId,
      params.actorGroupId,
      "member",
      params.actorId,
    )
    .then(({ data }) => data);

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

export const createOrgWeb: ImpureGraphFunction<
  {
    shortname: string;
    administrator: ActorEntityUuid;
  },
  Promise<{ webId: WebId; machineId: MachineId }>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi.createOrgWeb(actorId, params).then(({ data }) => ({
    webId: data.webId as WebId,
    machineId: data.machineId as MachineId,
  }));
