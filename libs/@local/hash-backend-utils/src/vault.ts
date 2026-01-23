import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider as credentialProvider } from "@aws-sdk/credential-provider-node";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { HttpRequest, type IHttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { type AxiosInstance } from "axios";
import axios, { AxiosError, AxiosHeaders } from "axios";

import { getRequiredEnv } from "./environment.js";
import type { Logger } from "./logger.js";

const toBase64 = (str: string) => Buffer.from(str, "utf8").toString("base64");

type VaultLoginResult = {
  client_token: string;
  lease_duration: number; // seconds
  renewable: boolean;
};

/**
 * Construct a signed AWS GetCallerIdentity request and send it to Vault.
 *
 * Vault will forward the request to AWS, and provide a token if the returned identity matches the ARN of an IAM role bound to a Vault role.
 *
 * @see https://developer.hashicorp.com/vault/docs/auth/aws
 */
const loginToVaultViaIam = async (opts: {
  logger: Logger;
  vaultAddr: string;
}): Promise<VaultLoginResult> => {
  const unsigned = new HttpRequest({
    protocol: "https:",
    hostname: "sts.amazonaws.com",
    method: "POST",
    path: "/",
    headers: {
      host: "sts.amazonaws.com",
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: "Action=GetCallerIdentity&Version=2011-06-15",
  });

  const region = process.env.AWS_REGION;

  if (!region) {
    throw new Error(
      "Cannot login to Vault via IAM, AWS_REGION is not set in environment",
    );
  }

  const signer = new SignatureV4({
    credentials: credentialProvider(),
    service: "sts",
    region,
    sha256: Sha256,
  });

  /**
   * Sign the request to AWS. This does not involve a network call – it creates a hash using AWS's signing algorithm.
   * The access ID of the credentials are transmitted as plain text, so that when Vault forwards the request to AWS,
   * AWS can look up the secret key associated with the access ID and verify the request using the same algorithm.
   */
  let signed: IHttpRequest;
  try {
    signed = await signer.sign(unsigned);
  } catch {
    throw new Error(
      "Failed to sign AWS request – probably no suitable credentials in environment",
    );
  }

  /**
   * @see https://developer.hashicorp.com/vault/api-docs/auth/aws#login
   */
  const payload = {
    iam_http_request_method: signed.method,
    iam_request_url: toBase64(`https://${signed.hostname}${signed.path}`),
    iam_request_body: toBase64(signed.body as string),
    iam_request_headers: toBase64(JSON.stringify(signed.headers)),
  };

  try {
    const response = await axios.post<{ auth: VaultLoginResult }>(
      `${opts.vaultAddr}/v1/auth/aws/login`,
      payload,
      { timeout: 5000 },
    );

    return response.data.auth;
  } catch (error) {
    let errorMessage = "IAM auth failed on request to Vault: ";
    if (error instanceof AxiosError) {
      errorMessage += `(AxiosError): ${JSON.stringify(error)}`;
    } else {
      errorMessage += `(Non-AxiosError): ${stringifyError(error)}`;
    }

    opts.logger.error(errorMessage);

    throw new Error("Failed to login to Vault via IAM");
  }
};

const renewToken = async (
  vaultAddr: string,
  token: string,
  logger: Logger,
): Promise<Omit<VaultLoginResult, "client_token">> => {
  try {
    const { data } = await axios.post<{
      auth: Omit<VaultLoginResult, "client_token">;
    }>(
      `${vaultAddr}/v1/auth/token/renew-self`,
      {},
      {
        headers: { "X-Vault-Token": token },
        timeout: 5000,
      },
    );

    return data.auth;
  } catch (error) {
    let errorMessage = "Failed to renew Vault token: ";
    if (error instanceof AxiosError) {
      errorMessage += `(AxiosError): ${JSON.stringify(error)}`;
    } else {
      errorMessage += `(Non-AxiosError): ${stringifyError(error)}`;
    }

    logger.error(errorMessage);

    throw new Error("Failed to renew Vault token");
  }
};

type VaultSecret<D = unknown> = {
  data: D;
  metadata: {
    created_time: string;
    custom_metadata: unknown;
    deletion_time: string;
    destroyed: boolean;
    version: number;
  };
};

type UserSecretPath = `users/${ActorEntityUuid}/${string}`;

type RenewableToken = {
  clientToken: string;
  leaseDurationMs: number;
  renewable: boolean;
};

export class VaultClient {
  readonly #vaultAddr: string;
  readonly #logger: Logger;
  readonly #secretMountPath: string;

  #client: AxiosInstance;
  #token: RenewableToken | string;
  #tokenRefreshPromise: Promise<void> | null = null;

  constructor(params: {
    endpoint: string;
    token: string | RenewableToken;
    logger: Logger;
    secretMountPath: string;
  }) {
    this.#vaultAddr = params.endpoint;
    this.#logger = params.logger;
    this.#secretMountPath = params.secretMountPath;
    this.#token = params.token;

    this.#client = axios.create({
      baseURL: `${params.endpoint}/v1`,
      headers: {
        "X-Vault-Token":
          typeof params.token === "string"
            ? params.token
            : params.token.clientToken,
      },
    });

    this.#client.interceptors.request.use(async (cfg) => {
      if (typeof this.#token === "string") {
        return cfg;
      }

      /**
       * Handle renewing the token if necessary.
       */
      await this.ensureToken();

      // eslint-disable-next-line no-param-reassign
      cfg.headers = new AxiosHeaders({
        ...cfg.headers,
        "X-Vault-Token":
          typeof this.#token === "string"
            ? this.#token
            : this.#token.clientToken,
      });

      return cfg;
    });

    this.#client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<{ errors: string[] }>) => {
        const vaultErrorMessages =
          error.response?.status.toString() === "404"
            ? ["Secret not found"]
            : (error.response?.data.errors ?? [error.message]);

        return Promise.reject(
          new Error(`Vault API Error: ${vaultErrorMessages.join(", ")}`),
        );
      },
    );
  }

  private async ensureToken() {
    if (typeof this.#token === "string") {
      return;
    }

    const now = Date.now();

    if (now < this.#token.leaseDurationMs - 60_000) {
      /**
       * The token is still valid for another minute, so we don't need to do anything.
       */
      return;
    }

    if (this.#tokenRefreshPromise) {
      await this.#tokenRefreshPromise;
      return;
    }

    this.#tokenRefreshPromise = (async () => {
      if (typeof this.#token === "string") {
        return;
      }

      if (this.#token.renewable) {
        try {
          const renewedToken = await renewToken(
            this.#vaultAddr,
            this.#token.clientToken,
            this.#logger,
          );

          this.#token.leaseDurationMs =
            now + renewedToken.lease_duration * 1_000;

          this.#token.renewable = renewedToken.renewable;
          return;
        } catch {
          this.#logger.warn("Failed to renew token, falling back to login");
        }
      }

      const login = await loginToVaultViaIam({
        vaultAddr: this.#vaultAddr,
        logger: this.#logger,
      });

      this.#token = {
        clientToken: login.client_token,
        leaseDurationMs: now + login.lease_duration * 1_000,
        renewable: login.renewable,
      };
    })().finally(() => {
      this.#tokenRefreshPromise = null;
    });

    await this.#tokenRefreshPromise;
  }

  async write<D extends object = Record<"value", string>>(params: {
    path: UserSecretPath;
    data: D;
  }): Promise<VaultSecret<D>> {
    const { path, data } = params;

    const response = await this.#client.post<{ data: VaultSecret["metadata"] }>(
      `/${this.#secretMountPath}/data/${path.replace(/^\//, "")}`,
      { data },
    );

    return {
      data,
      metadata: response.data.data,
    };
  }

  async read<D = unknown>(params: {
    path: string;
    userAccountId: ActorEntityUuid;
  }): Promise<VaultSecret<D>> {
    const { path } = params;

    const userAccountIdInPath = path.split("/").at(1);
    if (userAccountIdInPath !== params.userAccountId) {
      throw new Error(
        `User accountId '${userAccountIdInPath}' in secret path does not match provided accountId '${params.userAccountId}'`,
      );
    }

    const response = await this.#client.get<{ data: VaultSecret<D> }>(
      `/${this.#secretMountPath}/data/${path}`,
    );

    return response.data.data;
  }
}

export const createVaultClient = async ({
  logger,
}: {
  logger: Logger;
}) => {
  if (!process.env.HASH_VAULT_HOST || !process.env.HASH_VAULT_PORT) {
    logger.info(
      "No HASH_VAULT_HOST or HASH_VAULT_PORT provided, skipping Vault client creation",
    );
    return undefined;
  }

  const secretMountPath = getRequiredEnv("HASH_VAULT_MOUNT_PATH");

  if (!process.env.HASH_VAULT_ROOT_TOKEN) {
    logger.info("No Vault root token provided, attempting IAM auth");

    try {
      const login = await loginToVaultViaIam({
        vaultAddr: `${process.env.HASH_VAULT_HOST}:${process.env.HASH_VAULT_PORT}`,
        logger,
      });

      logger.info("Successfully logged in to Vault via IAM");

      return new VaultClient({
        endpoint: `${process.env.HASH_VAULT_HOST}:${process.env.HASH_VAULT_PORT}`,
        token: login.client_token,
        logger,
        secretMountPath,
      });
    } catch (error) {
      logger.error(
        `Failed to login to Vault via IAM: ${stringifyError(error)}`,
      );

      return undefined;
    }
  }

  logger.info(
    "Creating Vault client with HASH_VAULT_ROOT_TOKEN from environment",
  );

  return new VaultClient({
    endpoint: `${process.env.HASH_VAULT_HOST}:${process.env.HASH_VAULT_PORT}`,
    token: process.env.HASH_VAULT_ROOT_TOKEN,
    logger,
    secretMountPath,
  });
};

export type UserSecretService = "google" | "linear";

export const createUserSecretPath = ({
  accountId,
  restOfPath,
  service,
}: {
  /** The user's accountId */
  accountId: ActorEntityUuid;
  /** The rest of the path to the secret, determined by the service. May contain multiple segments. */
  restOfPath: string;
  /** The service the secret is for */
  service: UserSecretService;
}): UserSecretPath => {
  return `users/${accountId}/${service}/${restOfPath.replace(/^\//, "")}`;
};
