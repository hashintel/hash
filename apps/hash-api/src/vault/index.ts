import { EntityUuid } from "@local/hash-subgraph";
import axios, { AxiosError, AxiosInstance } from "axios";

import { isProdEnv } from "../lib/env-config";

type VaultSecret<D = any> = {
  data: D;
  metadata: {
    created_time: string;
    custom_metadata: any;
    deletion_time: string;
    destroyed: boolean;
    version: number;
  };
};

export class VaultClient {
  client: AxiosInstance;

  constructor(params: { endpoint: string; token: string }) {
    this.client = axios.create({
      baseURL: `${params.endpoint}/v1`,
      headers: {
        "X-Vault-Token": params.token,
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<{ errors: string[] }>) => {
        const vaultErrorMessages =
          error.status?.toString() === "404"
            ? ["Secret not found"]
            : error.response?.data.errors ?? [error.message];

        return Promise.reject(
          new Error(`Vault API Error: ${vaultErrorMessages.join(", ")}`),
        );
      },
    );
  }

  /**
   * Creates a user secret in Vault. Returns the data, metadata, and path of the created secret to be used in calls to readUserSecret
   *
   * @param params.data The data to store in the secret. Must be an object, the shape of which defaults to { value: string }
   * @param params.secretSubPath The path to store the secret at within the user's namespace, which will be automatically prepended.
   * @param params.userUuid The uuid of the user to store the secret for (its accountId)
   */
  async writeUserSecret<
    D extends Record<string, string> = Record<"value", string>,
  >(params: {
    data: D;
    secretSubPath: string;
    userUuid: EntityUuid;
  }): Promise<VaultSecret<D> & { path: string }> {
    const { data, secretSubPath, userUuid } = params;

    const secretPath = `user/${
      isProdEnv ? "prod" : "dev"
    }/${userUuid}/${secretSubPath.replace(/^\//, "")}`;

    const postPath = `/secret/data/${secretPath}`;

    const response = await this.client.post<{ data: VaultSecret["metadata"] }>(
      postPath,
      { data },
    );

    return {
      data,
      metadata: response.data.data,
      path: secretPath,
    };
  }

  async readUserSecret<D = any>(params: {
    path: string;
  }): Promise<VaultSecret<D>> {
    const { path } = params;

    const response = await this.client.get<{ data: VaultSecret<D> }>(
      `/secret/data/${path}`,
    );

    return response.data.data;
  }
}

export const createVaultClient = () => {
  return process.env.HASH_VAULT_HOST &&
    process.env.HASH_VAULT_PORT &&
    process.env.HASH_VAULT_TOKEN
    ? new VaultClient({
        endpoint: `${process.env.HASH_VAULT_HOST}:${process.env.HASH_VAULT_PORT}`,
        token: process.env.HASH_VAULT_TOKEN,
      })
    : undefined;
};
