import type {
  Entity,
  EntityId,
  MachineId,
  ProvidedEntityEditionProvenance,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { Team } from "@linear/sdk";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";

import type {
  EntityPrimaryKey,
  ProposedEntity,
  ProposedLink,
} from "./integrations/aviation/aero-api/client/build-graph.js";

export type { EntityPrimaryKey, ProposedEntity, ProposedLink };

export type PartialEntity = {
  properties: Entity["properties"];
  entityTypeId: VersionedUrl;
};

export const supportedLinearTypes = ["Issue", "User"] as const;

export type SupportedLinearType = (typeof supportedLinearTypes)[number];

export type CreateHashEntityFromLinearData = <
  T extends SupportedLinearType = SupportedLinearType,
>(params: {
  authentication: { actorId: MachineId };
  linearId: string;
  linearType: T;
  linearApiKey: string;
  webId: WebId;
}) => Promise<void>;

export type UpdateHashEntityFromLinearData = <
  T extends SupportedLinearType = SupportedLinearType,
>(params: {
  authentication: { actorId: MachineId };
  linearId: string;
  linearType: T;
  linearApiKey: string;
  webId: WebId;
}) => Promise<void>;

export type ReadLinearTeamsWorkflow = (params: {
  apiKey: string;
}) => Promise<Team[]>;

export type SyncWebWorkflow = (params: {
  authentication: { actorId: MachineId };
  apiKey: string;
  webId: WebId;
  teamIds: string[];
}) => Promise<void>;

export type UpdateLinearDataWorkflow = (params: {
  apiKey: string;
  authentication: { actorId: MachineId };
  linearId: string;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  entity: SerializedEntity;
}) => Promise<void>;

export type SyncQueryToGoogleSheetWorkflow = (params: {
  integrationEntityId: EntityId;
  userAccountId: MachineId;
}) => Promise<void>;

/**
 * Result of fetching scheduled flights from AeroAPI.
 */
export type GetScheduledFlightsResult = {
  entities: ProposedEntity[];
  links: ProposedLink[];
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
};

/**
 * Workflow to sync scheduled flights from AeroAPI to HASH.
 */
export type SyncScheduledFlightsWorkflow = (params: {
  authentication: { actorId: MachineId };
  airportIcao: string;
  date: string;
  webId: WebId;
}) => Promise<{
  entitiesCreated: number;
  entitiesUpdated: number;
  linksCreated: number;
}>;

export type WorkflowTypeMap = {
  syncLinearToWeb: SyncWebWorkflow;
  readLinearTeams: ReadLinearTeamsWorkflow;

  createHashEntityFromLinearData: CreateHashEntityFromLinearData;
  updateHashEntityFromLinearData: UpdateHashEntityFromLinearData;

  updateLinearData: UpdateLinearDataWorkflow;
  /** @todo: add `createLinearData` */

  syncScheduledFlights: SyncScheduledFlightsWorkflow;
};
