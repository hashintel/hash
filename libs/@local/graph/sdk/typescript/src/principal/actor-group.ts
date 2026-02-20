import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  AiId,
  MachineId,
  RoleName,
  TeamId,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import type {
  GraphApi,
  RoleAssignmentStatus,
  RoleUnassignmentStatus,
} from "@local/hash-graph-client";

import type { AuthenticationContext } from "../authentication-context.js";

export const getActorGroupMembers = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorGroupId: ActorGroupEntityUuid },
): Promise<ActorEntityUuid[]> =>
  graphApi
    .getActorGroupRoleAssignments(
      authentication.actorId,
      params.actorGroupId,
      "member",
    )
    .then(({ data }) => data as ActorEntityUuid[]);

export const addActorGroupMember = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleAssignmentStatus> =>
  graphApi
    .assignActorGroupRole(
      authentication.actorId,
      params.actorGroupId,
      "member",
      params.actorId,
    )
    .then(({ data }) => data);

export const getActorGroupRole = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleName | null> =>
  graphApi
    .getActorGroupRole(
      authentication.actorId,
      params.actorGroupId,
      params.actorId,
    )
    .then(({ data }) => data as RoleName | null);

export const removeActorGroupMember = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleUnassignmentStatus> =>
  graphApi
    .unassignActorGroupRole(
      authentication.actorId,
      params.actorGroupId,
      "member",
      params.actorId,
    )
    .then(({ data }) => data);

export const addActorGroupAdministrator = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleAssignmentStatus> =>
  graphApi
    .assignActorGroupRole(
      authentication.actorId,
      params.actorGroupId,
      "administrator",
      params.actorId,
    )
    .then(({ data }) => data);

export const removeActorGroupAdministrator = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleUnassignmentStatus> =>
  graphApi
    .unassignActorGroupRole(
      authentication.actorId,
      params.actorGroupId,
      "administrator",
      params.actorId,
    )
    .then(({ data }) => data);

export const createUserActor = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { shortname?: string; registrationComplete: boolean },
): Promise<{ userId: UserId; machineId: MachineId }> =>
  graphApi.createUserActor(authentication.actorId, params).then(({ data }) => ({
    userId: data.userId as UserId,
    machineId: data.machineId as MachineId,
  }));

export const createAiActor = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { identifier: string },
): Promise<AiId> =>
  graphApi
    .createAiActor(authentication.actorId, params)
    .then(({ data }) => data as AiId);

export const updateWebShortname = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { webId: WebId; shortname: string },
): Promise<void> =>
  graphApi
    .updateWebShortname(authentication.actorId, params.webId, {
      shortname: params.shortname,
    })
    .then(() => {});

export const createOrgWeb = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { shortname: string; administrator: ActorEntityUuid },
): Promise<{ webId: WebId; machineId: MachineId }> =>
  graphApi.createOrgWeb(authentication.actorId, params).then(({ data }) => ({
    webId: data.webId as WebId,
    machineId: data.machineId as MachineId,
  }));
