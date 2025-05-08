import type {
  ActorEntityUuid,
  ActorId,
  ActorType,
  ActorGroupEntityUuid,
  ActorGroupId,
  BaseUrl,
  EntityUuid,
  OntologyTypeVersion,
  RoleId,
  WebId,
} from "@blockprotocol/type-system-rs/types";
import type { VersionedUrl } from "@blockprotocol/type-system-rs";
export type Effect = "permit" | "forbid";
export interface Policy {
  id: PolicyId;
  effect: Effect;
  principal?: PrincipalConstraint;
  actions: ActionName[];
  resource?: ResourceConstraint;
}
import type { Brand } from "@local/advanced-types/brand";
export type PolicyId = Brand<string, "PolicyId">;
export type ActionName =
  | "all"
  | "create"
  | "createWeb"
  | "view"
  | "viewEntity"
  | "viewEntityType"
  | "update"
  | "instantiate";
export type PrincipalConstraint =
  | ({
      type: "actor";
    } & ActorId)
  | {
      type: "actorType";
      actor_type: ActorType;
    }
  | ({
      type: "actorGroup";
      actor_type?: ActorType;
    } & ActorGroupId)
  | ({
      type: "role";
      actor_type?: ActorType;
    } & RoleId);
export type ResourceConstraint =
  | {
      type: "web";
      web_id: WebId;
    }
  | ({
      type: "entity";
    } & EntityResourceConstraint)
  | ({
      type: "entityType";
    } & EntityTypeResourceConstraint);
export type EntityResourceConstraint =
  | {
      filter: EntityResourceFilter;
    }
  | {
      id: EntityUuid;
    }
  | {
      web_id: WebId;
      filter: EntityResourceFilter;
    };
export type EntityResourceFilter =
  | {
      type: "all";
      filters: EntityResourceFilter[];
    }
  | {
      type: "any";
      filters: EntityResourceFilter[];
    }
  | {
      type: "not";
      filter: EntityResourceFilter;
    }
  | {
      type: "isOfType";
      entity_type: VersionedUrl;
    };
export type EntityTypeId = string;
export type EntityTypeResourceConstraint =
  | {
      filter: EntityTypeResourceFilter;
    }
  | {
      id: EntityTypeId;
    }
  | {
      web_id: WebId;
      filter: EntityTypeResourceFilter;
    };
export type EntityTypeResourceFilter =
  | {
      type: "all";
      filters: EntityTypeResourceFilter[];
    }
  | {
      type: "any";
      filters: EntityTypeResourceFilter[];
    }
  | {
      type: "not";
      filter: EntityTypeResourceFilter;
    }
  | {
      type: "isBaseUrl";
      base_url: BaseUrl;
    }
  | {
      type: "isVersion";
      version: OntologyTypeVersion;
    };
