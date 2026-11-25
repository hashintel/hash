import { actorHeaders } from "@local/hash-graph-client";

import type { AuthenticationContext } from "../authentication-context.js";
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

export const getActorGroupMembers = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorGroupId: ActorGroupEntityUuid },
): Promise<ActorEntityUuid[]> =>
  graphApi
    .getActorGroupRoleAssignments(
      params.actorGroupId,
      "member",
      actorHeaders(authentication.actorId),
    )
    .then((data) => data as ActorEntityUuid[]);

export const addActorGroupMember = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleAssignmentStatus> =>
  graphApi.assignActorGroupRole(
    params.actorGroupId,
    "member",
    params.actorId,
    actorHeaders(authentication.actorId),
  );

export const getActorGroupRole = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleName | null> =>
  graphApi
    .getActorGroupRole(
      params.actorGroupId,
      params.actorId,
      actorHeaders(authentication.actorId),
    )
    .then((data) => data as RoleName | null);

export const removeActorGroupMember = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleUnassignmentStatus> =>
  graphApi.unassignActorGroupRole(
    params.actorGroupId,
    "member",
    params.actorId,
    actorHeaders(authentication.actorId),
  );

export const addActorGroupAdministrator = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleAssignmentStatus> =>
  graphApi.assignActorGroupRole(
    params.actorGroupId,
    "administrator",
    params.actorId,
    actorHeaders(authentication.actorId),
  );

export const removeActorGroupAdministrator = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { actorId: ActorEntityUuid; actorGroupId: WebId | TeamId },
): Promise<RoleUnassignmentStatus> =>
  graphApi.unassignActorGroupRole(
    params.actorGroupId,
    "administrator",
    params.actorId,
    actorHeaders(authentication.actorId),
  );

export const createUserActor = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { shortname?: string; registrationComplete: boolean },
): Promise<{ userId: UserId; machineId: MachineId }> =>
  graphApi
    .createUserActor(params, actorHeaders(authentication.actorId))
    .then((data) => ({
      userId: data.userId as UserId,
      machineId: data.machineId as MachineId,
    }));

export const createAiActor = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { identifier: string },
): Promise<AiId> =>
  graphApi
    .createAiActor(params, actorHeaders(authentication.actorId))
    .then((data) => data as AiId);

export const updateWebShortname = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { webId: WebId; shortname: string },
): Promise<void> =>
  graphApi
    .updateWebShortname(
      params.webId,
      {
        shortname: params.shortname,
      },
      actorHeaders(authentication.actorId),
    )
    .then(() => {});

export const createOrgWeb = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { shortname: string; administrator: ActorEntityUuid },
): Promise<{ webId: WebId; machineId: MachineId }> =>
  graphApi
    .createOrgWeb(params, actorHeaders(authentication.actorId))
    .then((data) => ({
      webId: data.webId as WebId,
      machineId: data.machineId as MachineId,
    }));
