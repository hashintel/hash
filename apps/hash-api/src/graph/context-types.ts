import type { UploadableStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type {
  ActorType,
  GraphApi as GraphApiClient,
  OriginProvenance,
} from "@local/hash-graph-client";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { DataSource } from "apollo-datasource";

export type GraphApi = GraphApiClient & DataSource;

export type ImpureGraphContext<
  RequiresUpload extends boolean = false,
  RequiresTemporal extends boolean = false,
> = {
  graphApi: GraphApi;
  provenance: {
    actorType: ActorType;
    origin: OriginProvenance;
  };
} & (RequiresUpload extends true
  ? { uploadProvider: UploadableStorageProvider }
  : { uploadProvider?: UploadableStorageProvider }) &
  (RequiresTemporal extends true
    ? { temporalClient: TemporalClient }
    : { temporalClient?: TemporalClient });

export type ImpureGraphFunction<
  Parameters,
  ReturnType,
  RequiresUpload extends boolean = false,
  RequiresTemporal extends boolean = false,
> = (
  context: ImpureGraphContext<RequiresUpload, RequiresTemporal>,
  authentication: AuthenticationContext,
  params: Parameters,
) => ReturnType;

export type PureGraphFunction<Parameters, ReturnType> = (
  params: Parameters,
) => ReturnType;
