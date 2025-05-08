import type { Real } from "@rust/hash-codec/types";
import type { Brand } from "@local/advanced-types/brand";
export type DraftId = Brand<string, "DraftId">;
export type EntityEditionId = Brand<string, "EntityEditionId">;
export type EntityUuid = Brand<string, "EntityUuid">;
export type PropertyValue =
  | null
  | boolean
  | string
  | Real
  | PropertyValue[]
  | {
      [key: string]: PropertyValue;
    };
export type BaseUrl = Brand<string, "BaseUrl">;
export type OntologyTypeVersion = Brand<number, "OntologyTypeVersion">;
export type Principal =
  | ({
      principalType: "actor";
    } & Actor)
  | ({
      principalType: "actorGroup";
    } & ActorGroup)
  | ({
      principalType: "role";
    } & Role);
export type PrincipalId =
  | ({
      principalType: "actor";
    } & ActorId)
  | ({
      principalType: "actorGroup";
    } & ActorGroupId)
  | ({
      principalType: "role";
    } & RoleId);
export type Actor =
  | ({
      actorType: "user";
    } & User)
  | ({
      actorType: "machine";
    } & Machine)
  | ({
      actorType: "ai";
    } & Ai);
export type ActorEntityUuid = Brand<EntityUuid, "ActorEntityUuid">;
export type ActorId =
  | {
      actorType: "user";
      id: UserId;
    }
  | {
      actorType: "machine";
      id: MachineId;
    }
  | {
      actorType: "ai";
      id: AiId;
    };
export type ActorType = "user" | "machine" | "ai";
export interface Ai {
  id: AiId;
  identifier: string;
  roles: RoleId[];
}
export type AiId = Brand<ActorEntityUuid, "AiId">;
export interface Machine {
  id: MachineId;
  identifier: string;
  roles: RoleId[];
}
export type MachineId = Brand<ActorEntityUuid, "MachineId">;
export interface User {
  id: UserId;
  roles: RoleId[];
}
export type UserId = Brand<ActorEntityUuid & WebId, "UserId">;
export type ActorGroup =
  | ({
      actorGroupType: "web";
    } & Web)
  | ({
      actorGroupType: "team";
    } & Team);
export type ActorGroupEntityUuid = Brand<EntityUuid, "ActorGroupEntityUuid">;
export type ActorGroupId =
  | {
      actorGroupType: "web";
      id: WebId;
    }
  | {
      actorGroupType: "team";
      id: TeamId;
    };
export type ActorGroupType = "web" | "team";
export interface Team {
  id: TeamId;
  parentId: ActorGroupId;
  name: string;
  roles: TeamRoleId[];
}
export type TeamId = Brand<ActorGroupEntityUuid, "TeamId">;
export interface Web {
  id: WebId;
  shortname?: string;
  roles: WebRoleId[];
}
export type WebId = Brand<ActorGroupEntityUuid | ActorEntityUuid, "WebId">;
export type Role =
  | ({
      roleType: "web";
    } & WebRole)
  | ({
      roleType: "team";
    } & TeamRole);
export type RoleId =
  | {
      roleType: "web";
      id: WebRoleId;
    }
  | {
      roleType: "team";
      id: TeamRoleId;
    };
export type RoleName = "administrator" | "member";
export type RoleType = "web" | "team";
export interface TeamRole {
  id: TeamRoleId;
  teamId: TeamId;
  name: RoleName;
}
export type TeamRoleId = Brand<string, "TeamRoleId">;
export interface WebRole {
  id: WebRoleId;
  webId: WebId;
  name: RoleName;
}
export type WebRoleId = Brand<string, "WebRoleId">;
