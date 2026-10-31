import type { EmailTransporter } from "../email/transporters";
import type { GraphApi } from "../graph/context-types";
import type { User } from "../graph/knowledge/system-types/user";
import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { RunningFlowRunHistoryCache } from "@local/hash-backend-utils/flows/run-events/running-flow-run-history-cache";
import type { FlowRunRecordsByWorkflowId } from "@local/hash-backend-utils/flows/run-record";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

/**
 * Apollo context object with dataSources. For details see:
 * https://www.apollographql.com/docs/apollo-server/data/data-sources/
 */
export interface GraphQLContext {
  dataSources: {
    graphApi: GraphApi;
    uploadProvider: FileStorageProvider;
  };
  emailTransporter: EmailTransporter;
  logger: Logger;
  authentication: AuthenticationContext;
  user?: User;
  provenance: ProvidedEntityEditionProvenance;
  temporal: TemporalClient;
  /**
   * Flow run records read while resolving this request, so fields of the same run read its record once.
   */
  flowRunRecords: FlowRunRecordsByWorkflowId;
  /** Histories of running flow runs, shared across requests. */
  runningFlowRunHistories: RunningFlowRunHistoryCache;
  vault?: VaultClient;
}

export interface LoggedInGraphQLContext extends GraphQLContext {
  user: User;
}
