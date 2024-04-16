import type { UploadableStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { GraphApi as GraphApiClient } from "@local/hash-graph-client";
import type { DataSource } from "apollo-datasource";

import type { AuthenticationContext } from "../graphql/authentication-context";
import type { TemporalClient } from "../temporal";

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
