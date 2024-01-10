import type { AxiosError, AxiosInstance } from "axios";
import axios from "axios";

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

  async write<
    D extends Record<string, string> = Record<"value", string>,
  >(params: {
    secretMountPath: string;
    path: string;
    data: D;
  }): Promise<VaultSecret<D>> {
    const { secretMountPath, path, data } = params;

    const response = await this.client.post<{ data: VaultSecret["metadata"] }>(
      `/${secretMountPath}/data/${path}`,
      { data },
    );

    return {
      data,
      metadata: response.data.data,
    };
  }

  async read<D = any>(params: {
    secretMountPath: string;
    path: string;
  }): Promise<VaultSecret<D>> {
    const { secretMountPath, path } = params;

    const response = await this.client.get<{ data: VaultSecret<D> }>(
      `/${secretMountPath}/data/${path}`,
    );

    return response.data.data;
  }
}

export const createVaultClient = () => {
  return process.env.HASH_VAULT_HOST &&
    process.env.HASH_VAULT_PORT &&
    process.env.HASH_VAULT_ROOT_TOKEN
    ? new VaultClient({
        endpoint: `${process.env.HASH_VAULT_HOST}:${process.env.HASH_VAULT_PORT}`,
        token: process.env.HASH_VAULT_ROOT_TOKEN,
      })
    : undefined;
};
