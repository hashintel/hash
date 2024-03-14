import type { AccountId } from "@local/hash-subgraph";
import type { AxiosError, AxiosInstance } from "axios";
import axios from "axios";

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

type UserSecretPath = `users/${AccountId}/${string}`;

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
          error.response?.status.toString() === "404"
            ? ["Secret not found"]
            : error.response?.data.errors ?? [error.message];

        return Promise.reject(
          new Error(`Vault API Error: ${vaultErrorMessages.join(", ")}`),
        );
      },
    );
  }

  async write<D extends object = Record<"value", string>>(params: {
    secretMountPath: "secret";
    path: UserSecretPath;
    data: D;
  }): Promise<VaultSecret<D>> {
    const { secretMountPath, path, data } = params;

    const response = await this.client.post<{ data: VaultSecret["metadata"] }>(
      `/${secretMountPath}/data/${path.replace(/^\//, "")}`,
      { data },
    );

    return {
      data,
      metadata: response.data.data,
    };
  }

  async read<D = unknown>(params: {
    secretMountPath: "secret";
    path: string;
    userAccountId: AccountId;
  }): Promise<VaultSecret<D>> {
    const { secretMountPath, path } = params;

    const userAccountIdInPath = path.split("/").at(1);
    if (userAccountIdInPath !== params.userAccountId) {
      throw new Error(
        `User accountId '${userAccountIdInPath}' in secret path does not match provided accountId '${params.userAccountId}'`,
      );
    }

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

export type UserSecretService = "google" | "linear";

export const createUserSecretPath = ({
  accountId,
  restOfPath,
  service,
}: {
  /** The user's accountId */
  accountId: AccountId;
  /** The rest of the path to the secret, determined by the service. May contain multiple segments. */
  restOfPath: string;
  /** The service the secret is for */
  service: UserSecretService;
}): UserSecretPath => {
  return `users/${accountId}/${service}/${restOfPath.replace(/^\//, "")}`;
};
