import type { Logger } from "@local/hash-backend-utils/logger";
import {
  AccountService,
  createTransport,
  multiaddr,
} from "@local/hash-graph-rpc-ts-client";

export interface RpcClient {
  accounts: InstanceType<typeof AccountService>;

  close(): Promise<void>;
}

export const createGraphRpcClient = async (
  _logger: Logger,
  { host, port }: { host: string; port: number },
): Promise<RpcClient> => {
  console.log(host, port);
  const remote = multiaddr(`/ip4/${host}/tcp/${port}/ws/`);
  const transport = await createTransport();

  const accounts = new AccountService(remote, transport.services.rpc);

  return {
    accounts,

    async close() {
      console.log("BYE BYE");
      await transport.stop();
    },
  };
};
