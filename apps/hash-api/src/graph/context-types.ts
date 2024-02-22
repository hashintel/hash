import { GraphApi as GraphApiClient } from "@local/hash-graph-client";
import { DataSource } from "apollo-datasource";

import { AuthenticationContext } from "../graphql/authentication-context";
import { UploadableStorageProvider } from "../storage/storage-provider";
import { TemporalClient } from "../temporal";

export type GraphApi = GraphApiClient & DataSource;

export type ImpureGraphContext<
  WithUpload extends boolean = false,
  WithTemporal extends boolean = false,
> = {
  graphApi: GraphApi;
} & (WithUpload extends true
  ? { uploadProvider: UploadableStorageProvider }
  : Record<string, unknown>) &
  (WithTemporal extends true
    ? { temporalClient: TemporalClient }
    : Record<string, unknown>);

export type ImpureGraphFunction<
  Parameters,
  ReturnType,
  WithUpload extends boolean = false,
  WithTemporal extends boolean = false,
> = (
  context: ImpureGraphContext<WithUpload, WithTemporal>,
  authentication: AuthenticationContext,
  params: Parameters,
) => ReturnType;

export type PureGraphFunction<Parameters, ReturnType> = (
  params: Parameters,
) => ReturnType;
