import { GraphApi as GraphApiClient } from "@local/hash-graph-client";
import { DataSource } from "apollo-datasource";

import { AuthenticationContext } from "../graphql/authentication-context";
import { UploadableStorageProvider } from "../storage/storage-provider";

export type GraphApi = GraphApiClient & DataSource;

export type ImpureGraphContext<WithUpload extends boolean = false> = {
  graphApi: GraphApi;
} & (WithUpload extends true
  ? { uploadProvider: UploadableStorageProvider }
  : Record<string, unknown>);

export type ImpureGraphFunction<
  Parameters,
  ReturnType,
  WithUpload extends boolean = false,
> = (
  context: ImpureGraphContext<WithUpload>,
  authentication: AuthenticationContext,
  params: Parameters,
) => ReturnType;

export type PureGraphFunction<Parameters, ReturnType> = (
  params: Parameters,
) => ReturnType;
