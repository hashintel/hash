import { PartialEntity } from "@local/hash-backend-utils/temporal-integration-workflow-types";
import { GraphApi } from "@local/hash-graph-client";
import {
  AccountId,
  EntityRootType,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";

export const writeSubgraphToGoogleSheet = async (params: {
  spreadsheetId: string;
  entitySubgraph: Subgraph<EntityRootType>;
}) => {};
