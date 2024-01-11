import type { Logger } from "@local/hash-backend-utils/logger";
import {
  AccountService,
  createTransport,
  multiaddr,
} from "@local/hash-graph-rpc-ts-client";
import * as Client from "@local/hash-graph-rpc-ts-client/Client";

export interface RpcClient {
  accounts: InstanceType<typeof AccountService>;

  close(): Promise<void>;
}

export const createGraphRpcClient = async (
  _logger: Logger,
  { host, port }: { host: string; port: number },
): Promise<RpcClient> => {
  const remote = multiaddr(`/ip4/${host}/tcp/${port}/ws/`);
  const transport = await createTransport();

  const client = Client.create(transport, remote, {});
  const accounts = new AccountService(client);

  return {
    accounts,

    async close() {
      await transport.stop();
    },
  };
};
