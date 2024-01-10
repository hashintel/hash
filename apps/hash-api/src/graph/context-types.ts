import { RpcClient } from "@local/hash-backend-utils/create-graph-rpc-client";
import { GraphApi as GraphApiClient } from "@local/hash-graph-client";
import { DataSource } from "apollo-datasource";

import { AuthenticationContext } from "../graphql/authentication-context";
import { UploadableStorageProvider } from "../storage/storage-provider";

export type GraphApi = GraphApiClient & DataSource;

export type ImpureGraphContext<
  WithUpload extends boolean = false,
  WithRpc extends boolean = false,
> = {
  graphApi: GraphApi;
} & (WithUpload extends true
  ? { uploadProvider: UploadableStorageProvider }
  : {}) &
  (WithRpc extends true ? { rpcClient: RpcClient } : {});

export type ImpureGraphFunction<
  Parameters,
  ReturnType,
  WithUpload extends boolean = false,
  WithRpc extends boolean = false,
> = (
  context: ImpureGraphContext<WithUpload, WithRpc>,
  authentication: AuthenticationContext,
  params: Parameters,
) => ReturnType;

export type PureGraphFunction<Parameters, ReturnType> = (
  params: Parameters,
) => ReturnType;
