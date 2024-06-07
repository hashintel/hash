import type { UploadableStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { GraphApi as GraphApiClient } from "@local/hash-graph-client";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { DataSource } from "apollo-datasource";

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
