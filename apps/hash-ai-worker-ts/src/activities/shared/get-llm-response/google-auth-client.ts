import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { AwsClient } from "google-auth-library";
import { AwsClient as VertexAwsClient } from "google-auth-library-v10";

/**
 * Workload Identity Federation (WIF) auth for AWS → Google Cloud.
 *
 * The config in `GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON` declares
 * an EC2-instance-metadata (IMDS) credential source. ECS Fargate does not expose
 * EC2 IMDS, and google-auth-library's built-in AWS supplier only reads EC2 IMDS
 * or standard `AWS_*` env vars — so the default flow cannot obtain the task-role
 * credentials on Fargate. We replace the credential source with a supplier backed
 * by the AWS SDK provider chain, which resolves the Fargate container-credentials
 * endpoint (and env vars / EC2 IMDS, so it also works on EC2 and locally).
 *
 * Two clients, because the consumers pin different google-auth-library majors:
 * `@google-cloud/storage` is on v9, the `@google/genai` (Vertex) SDK on v10, and
 * their `getRequestHeaders()` shapes are incompatible (a v9 client handed to
 * genai throws "authHeaders is not iterable"). Both clients share the supplier.
 *
 * Each getter returns `undefined` when no WIF config is present (e.g. local
 * development), so the Google SDKs fall back to Application Default Credentials
 * (`gcloud auth application-default login`).
 */
const buildWorkloadIdentityOptions = ():
  | Record<string, unknown>
  | undefined => {
  const workloadIdentityConfig =
    process.env.GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON;

  if (!workloadIdentityConfig) {
    return undefined;
  }

  const awsRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;

  if (!awsRegion) {
    throw new Error(
      "AWS_REGION (or AWS_DEFAULT_REGION) must be set to authenticate to Google Cloud via Workload Identity Federation",
    );
  }

  const provideAwsCredentials = fromNodeProviderChain();

  return {
    ...(JSON.parse(workloadIdentityConfig) as Record<string, unknown>),
    // Replaces the config's EC2-IMDS credential_source (unavailable on Fargate).
    credential_source: undefined,
    aws_security_credentials_supplier: {
      getAwsRegion: () => Promise.resolve(awsRegion),
      getAwsSecurityCredentials: async () => {
        const credentials = await provideAwsCredentials();

        return {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          token: credentials.sessionToken,
        };
      },
    },
  };
};

/** google-auth-library v9 client, for `@google-cloud/storage`. */
let _storageAuthClient: AwsClient | undefined;

export const getGoogleAuthClient = (): AwsClient | undefined => {
  if (_storageAuthClient) {
    return _storageAuthClient;
  }

  const options = buildWorkloadIdentityOptions();

  if (!options) {
    return undefined;
  }

  _storageAuthClient = new AwsClient(
    options as ConstructorParameters<typeof AwsClient>[0],
  );

  return _storageAuthClient;
};

/** google-auth-library v10 client, for the `@google/genai` (Vertex AI) SDK. */
let _vertexAuthClient: VertexAwsClient | undefined;

export const getVertexAuthClient = (): VertexAwsClient | undefined => {
  if (_vertexAuthClient) {
    return _vertexAuthClient;
  }

  const options = buildWorkloadIdentityOptions();

  if (!options) {
    return undefined;
  }

  _vertexAuthClient = new VertexAwsClient(
    options as ConstructorParameters<typeof VertexAwsClient>[0],
  );

  return _vertexAuthClient;
};
